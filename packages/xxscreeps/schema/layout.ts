import type { EnumTypes, Format, Interceptor, Primitive, UnionDeclaration } from './format.js';
import { ownEntriesIncludingPrivate } from 'xxscreeps/driver/private/runtime.js';
import { compositeComparator, mappedNumericComparator, mappedPrimitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { Variant } from './format.js';

export const kPointerSize = 4;
export const kHeaderSize = kPointerSize * 4;
export const kMagic = 0x00fff35a;

export function alignTo(address: number, align: number) {
	const alignMinusOne = align - 1;
	return ~alignMinusOne & (+address + alignMinusOne);
}

type ResolvedFormat<Type> =
	(Type extends () => infer First ? First : never) |
	(Type extends () => unknown ? never : Type);
export function resolve<Type>(declaration: Type): ResolvedFormat<Type>;
export function resolve(declaration: unknown): unknown {
	if (typeof declaration === 'function') {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		return resolve(declaration() as unknown);
	} else {
		return declaration;
	}
}

// Object-like materialized schema value
export type Subject = Record<keyof any, unknown>;

export type Layout =
	Primitive | ComposedLayout | NamedLayout |
	ArrayLayout | ConstantLayout | EnumLayout | OptionalLayout | StructLayout | VariantLayout | VectorLayout;

export const LayoutIdentity = Symbol('layoutIdentity');

interface ArrayLayout {
	array: Layout;
	length: number;
	stride: number;
}

export interface ComposedLayout {
	composed: Layout;
	interceptor: Interceptor;
}

interface ConstantLayout {
	constant: unknown;
}

interface EnumLayout {
	enum: EnumTypes[];
}

interface NamedLayout {
	named: string;
	layout: Layout;
}

interface OptionalIntrinsicLayout {
	size: number;
	uninitialized: null | undefined;
}

interface OptionalDynamic extends OptionalIntrinsicLayout {
	pointer: Layout;
	align: number;
}

interface OptionalStatic extends OptionalIntrinsicLayout {
	optional: Layout;
}

type OptionalLayout = OptionalDynamic | OptionalStatic;

export interface StructLayout {
	struct: Record<string | symbol, {
		offset: number;
		member: Layout;
		union?: true;
	}>;
	inherit?: StructLayout;
	variant: number | string | undefined;
}

interface VariantLayout {
	variant: {
		align: number;
		layout: Layout;
		size: number;
	}[];
}

interface VectorIntrinsicLayout {
	align: number;
	size: number;
}

interface VectorDynamicLayout extends VectorIntrinsicLayout {
	list: Layout;
}

interface VectorStaticLayout extends VectorIntrinsicLayout {
	vector: Layout;
	stride: number;
}

type VectorLayout = VectorDynamicLayout | VectorStaticLayout;

export interface Traits {
	align: number;
	size: number;
	stride?: number | undefined;
}

export interface LayoutAndTraits {
	layout: Layout;
	traits: Traits;
}

export function getLayout(unresolvedFormat: Format, cache: Map<Format, LayoutAndTraits>): LayoutAndTraits {
	return getOrSet(cache, unresolvedFormat, () => getResolvedLayout(resolve(unresolvedFormat), cache));
}

function getResolvedLayout(format: Format, cache: Map<Format, LayoutAndTraits>): LayoutAndTraits {
	return getOrSet(cache, format, (): LayoutAndTraits => {
		if (typeof format === 'string') {
			// Check for integral types
			const numericSizes = {
				bool: 1,
				int8: 1,
				int16: 2,
				int32: 4,
				uint8: 1,
				uint16: 2,
				uint32: 4,
				double: 8,
			};
			if (format in numericSizes) {
				const key = format as keyof typeof numericSizes;
				const size = numericSizes[key];
				return {
					layout: format,
					traits: {
						align: size,
						size,
						stride: size,
					},
				};
			}

			// String or buffer
			return {
				layout: format,
				traits: {
					align: kPointerSize,
					size: kPointerSize * 2,
				},
			};

		} else if ('array' in format) {
			const length = format.length;
			const { layout, traits } = getLayout(format.array, cache);
			const size = alignTo(traits.size, traits.align) * (length - 1) + traits.size;
			if (traits.stride === undefined) {
				throw new Error('Deque type not implemented');
			}
			return {
				layout: {
					array: layout,
					length,
					stride: traits.stride,
				},
				traits: {
					align: traits.align,
					size,
					stride: alignTo(size, traits.align),
				},
			};

		} else if ('composed' in format) {
			const { interceptor } = format;
			const { layout, traits } = getLayout(format.composed, cache);
			return {
				layout: {
					composed: layout,
					interceptor,
				},
				traits,
			};

		} else if ('constant' in format) {
			return {
				layout: format,
				traits: { align: 1, size: 0, stride: 0 },
			};

		} else if ('enum' in format) {
			return {
				layout: format,
				traits: { align: 1, size: 1, stride: 1 },
			};

		} else if ('named' in format) {
			const { layout, traits } = getLayout(format.format, cache);
			return {
				layout: {
					named: format.named,
					layout,
				},
				traits,
			};

		} else if ('optional' in format) {
			const { layout, traits } = getLayout(format.optional, cache);
			if (traits.size <= kPointerSize * 2) {
				return {
					layout: {
						optional: layout,
						size: traits.size,
						uninitialized: format.uninitialized,
					},
					traits: {
						align: traits.align,
						size: traits.size + 1,
						stride: traits.stride === undefined ? undefined : alignTo(traits.size + 1, traits.align),
					},
				};
			} else {
				return {
					layout: {
						pointer: layout,
						align: traits.align,
						size: traits.size,
						uninitialized: format.uninitialized,
					},
					traits: {
						align: kPointerSize,
						size: kPointerSize,
					},
				};
			}

		} else if ('struct' in format) {
			// Grab layout for structure members
			const allEntries = Fn.pipe(
				ownEntriesIncludingPrivate(format.struct) satisfies
					Iterable<[ string | symbol, Format | UnionDeclaration ]> as
					Iterable<[ string | symbol, Format ] | [ string, UnionDeclaration ]>,
				$$ => Fn.reject($$, ([ key ]) => key === Variant),
				$$ => [ ...$$ ]);
			const unionLength = Fn.partition(allEntries, entry => typeof entry[1] === 'object' && 'union' in entry[1]);
			const unionReferences = Fn.slice(allEntries, 0, unionLength) as Iterable<[ string, UnionDeclaration ]>;
			const memberDeclarations = Fn.slice(allEntries, unionLength) as Iterable<[ string | symbol, Format ]>;
			const entries = [ ...Fn.map(memberDeclarations, ([ key, member ]) => ({ key, ...getLayout(member, cache) })) ];

			// Sort members for struct packing
			entries.sort(compositeComparator([
				mappedNumericComparator(entry => entry.traits.size),
				mappedNumericComparator(entry => entry.traits.align),
				mappedPrimitiveComparator(({ key }) => typeof key === 'string' ? key : key.description ?? ''),
			]));

			// Create member layout
			const baseLayout = format.inherit && getLayout(format.inherit, cache);
			let offset = baseLayout?.traits.size ?? 0;
			const paddingFor = (member: LayoutAndTraits) => alignTo(offset, member.traits.align) - offset;
			const structMembers = [ ...function*() {
				while (entries.length !== 0) {
					const [ minimum ] = Fn.pipe(
						entries.entries(),
						$$ => Fn.map($$, ([ ii, entry ]) => [ ii, paddingFor(entry) ] as const),
						$$ => Fn.minimum($$, mappedNumericComparator(([ , padding ]) => padding)),
						$$ => $$ ?? function() {
							throw new Error('Impossible');
						}());
					const member = entries.splice(minimum, 1)[0]!;
					const { key, layout, traits } = member;
					offset = alignTo(offset, traits.align);
					yield {
						key,
						info: {
							offset,
							member: layout,
						},
						traits,
					};
					offset += traits.size;
				}
			}() ];

			// Calculate struct traits
			const align = Math.max(baseLayout?.traits.align ?? 1, ...Fn.map(structMembers, member => member.traits.align));
			const size = offset;
			const isFixedSize =
				(!baseLayout || baseLayout.traits.stride !== undefined) &&
				structMembers.every(member => member.traits.stride !== undefined);

			// Add union entries
			const members = [ ...structMembers, ...function*() {
				for (const [ key, union ] of unionReferences) {
					const [ referencedKey, unionFormat ] = Fn.first(ownEntriesIncludingPrivate(union.union))!;
					const { layout, traits } = getLayout(unionFormat, cache);
					const referencedMember = structMembers.find(info => info.key === referencedKey)!;
					if (traits.align > referencedMember.traits.align) {
						throw new Error('Union alignment error');
					}
					yield {
						key,
						info: {
							offset: referencedMember.info.offset,
							member: layout,
							union: true as const,
						},
						traits,
					};
				}
			}() ];

			return {
				layout: {
					struct: Object.fromEntries(members.map(member => [ member.key, member.info ])),
					inherit: baseLayout?.layout as StructLayout,
					variant: format.variant,
				},
				traits: {
					align,
					size,
					stride: isFixedSize ? alignTo(size, align) : undefined,
				},
			};

		} else if ('variant' in format) {
			return {
				layout: {
					variant: format.variant.map(variant => {
						const { layout, traits } = getLayout(variant, cache);
						return {
							layout,
							align: traits.align,
							size: traits.size,
						};
					}),
				},
				traits: {
					align: kPointerSize,
					size: kPointerSize + 1,
				},
			};

		} else if ('vector' in format) {
			const { layout, traits } = getLayout(format.vector, cache);
			if (traits.stride === undefined) {
				return {
					layout: {
						list: layout,
						align: traits.align,
						size: traits.size,
					},
					traits: {
						align: kPointerSize,
						size: kPointerSize,
					},
				};
			} else {
				return {
					layout: {
						vector: layout,
						align: traits.align,
						size: traits.size,
						stride: traits.stride,
					},
					traits: {
						align: kPointerSize,
						size: kPointerSize * 2,
					},
				};
			}
		} else {
			throw new Error('Invalid format');
		}
	});
}

export function unpackWrappedStruct(layout: Layout): StructLayout {
	if (typeof layout !== 'string') {
		if ('composed' in layout) {
			return unpackWrappedStruct(layout.composed);
		} else if ('named' in layout) {
			return unpackWrappedStruct(layout.layout);
		} else if ('struct' in layout) {
			return layout;
		}
	}
	throw new Error('Couldn\'t find struct');
}
