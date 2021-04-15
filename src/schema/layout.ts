import { Implementation } from 'xxscreeps/utility/types';
import { Cache, getOrSet } from './cache';
import { ConstantFormat, EnumFormat, Format, Interceptor, Primitive, Variant } from './format';
import { injectGetters } from './overlay';
import { entriesWithSymbols } from './symbol';

export const kPointerSize = 4;

export function alignTo(address: number, align: number) {
	const alignMinusOne = align - 1;
	return ~alignMinusOne & (+address + alignMinusOne);
}

type ResolvedFormat<Type> =
	(Type extends () => infer First ? First : never) |
	(Type extends () => any ? never : Type);
export function resolve<Type>(declaration: Type): ResolvedFormat<Type> {
	if (typeof declaration === 'function') {
		return resolve(declaration());
	}
	return declaration as never;
}

export type Layout =
	Primitive | ComposedLayout | NamedLayout |
	ArrayLayout | ConstantLayout | EnumLayout | OptionalLayout | StructLayout | VariantLayout | VectorLayout;

type ArrayLayout = {
	array: Layout;
	length: number;
	size: number;
	stride?: number;
};

type ComposedLayout = {
	composed: Layout;
	interceptor: Interceptor | Implementation;
};

type ConstantLayout = ConstantFormat;
type EnumLayout = EnumFormat;

type NamedLayout = {
	named: string;
	layout: Layout;
};

type OptionalLayout = {
	optional: Layout;
	align: number;
};

export type StructLayout = {
	struct: Record<string | symbol, {
		align: number;
		offset: number;
		pointer?: true;
		layout: Layout;
	}>;
	inherit?: StructLayout;
	size: number;
	variant?: number | string;
};

type VariantLayout = {
	variant: {
		align: number;
		struct: StructLayout;
	}[];
};

type VectorLayout = {
	vector: Layout;
	align: number;
	size: number;
	stride?: number;
};

type Traits = {
	align: number;
	size: number;
	stride?: number;
};

export type LayoutAndTraits = { layout: Layout; traits: Traits };

export function getLayout(unresolvedFormat: Format, cache: Cache): LayoutAndTraits {
	return getOrSet(cache.layout, unresolvedFormat, () => getResolvedLayout(resolve(unresolvedFormat), cache));
}

function getResolvedLayout(format: Format, cache: Cache): LayoutAndTraits {
	return getOrSet(cache.layout, format, () => {
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

			// Other basic type
			return {
				layout: format,
				traits: {
					align: kPointerSize,
					size: kPointerSize,
				},
			};

		} else if ('array' in format) {
			const length = format.length;
			const { layout, traits } = getLayout(format.array, cache);
			const size = alignTo(traits.size, traits.align) * (length - 1) + traits.size;
			return {
				layout: {
					array: layout,
					length,
					size,
					stride: traits.stride,
				},
				traits: {
					align: traits.align,
					size,
					stride: traits.stride && (traits.stride * (length - 1) + traits.size),
				},
			};

		} else if ('composed' in format) {
			const { interceptor } = format;
			const { layout, traits } = getLayout(format.composed, cache);
			if ('prototype' in interceptor) {
				// Inject prototype getters into overlay
				injectGetters(unpackWrappedStruct(layout), interceptor.prototype, cache);
			}
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
			return {
				layout: {
					optional: layout,
					align: traits.align,
				},
				traits: {
					align: 1,
					size: 1,
				},
			};

		} else if ('struct' in format) {
			// Grab layout for structure members
			const members = entriesWithSymbols(format.struct)
				.filter(entry => entry[0] !== Variant)
				.map(([ key, member ]) => ({
					key,
					...getLayout(member, cache),
				}));

			// Simple struct pack algorithm by sorting by size largest to smallest
			type MemberDescriptor = typeof members[number];
			const isPointer = (member: MemberDescriptor) => member.traits.stride === undefined;
			members.sort((left, right) => {
				const size = (member: MemberDescriptor) => isPointer(member) ? kPointerSize : member.traits.size;
				const elementSize = (member: MemberDescriptor) => isPointer(member) ? member.traits.size : Infinity;
				const nameOf = (el: string | symbol) => typeof el === 'string' ? el : el.description ?? '';
				return (
					size(right) - size(left) ||
					elementSize(right) - elementSize(left) ||
					nameOf(left.key).localeCompare(nameOf(right.key))
				);
			});

			// Arrange member layout
			const baseLayout = format.inherit && getLayout(format.inherit, cache);
			let offset = baseLayout?.traits.size ?? 0;
			const arrangedMembers = members.map(member => {
				const pointer = isPointer(member);
				const { layout, traits } = member;
				const memberOffset = alignTo(offset, pointer ? kPointerSize : traits.align);
				offset += pointer ? kPointerSize : traits.size;
				return {
					key: member.key,
					info: {
						align: traits.align,
						offset: memberOffset,
						...pointer && { pointer: true as const },
						layout,
					},
					traits,
				};
			});

			// Calculate struct traits
			const hasPointerElement = arrangedMembers.some(member => member.info.pointer);
			const align = Math.max(...arrangedMembers.map(member =>
				member.info.pointer ? kPointerSize : member.traits.align));
			const lastMember = arrangedMembers[arrangedMembers.length - 1];
			const size = lastMember.info.offset + (lastMember.info.pointer ? kPointerSize : lastMember.traits.size);
			const isFixedSize = !hasPointerElement && (!baseLayout || baseLayout.traits.stride !== undefined);
			return {
				layout: {
					struct: Object.fromEntries(arrangedMembers.map(member => [ member.key, member.info ])),
					inherit: baseLayout?.layout as StructLayout,
					size,
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
							struct: layout as StructLayout,
							align: traits.align,
						};
					}),
				},
				traits: {
					align: kPointerSize,
					size: kPointerSize,
				},
			};

		} else if ('vector' in format) {
			const { layout, traits } = getLayout(format.vector, cache);
			return {
				layout: {
					vector: layout,
					align: Math.max(traits.align, kPointerSize),
					size: traits.size,
					stride: traits.stride,
				},
				traits: {
					align: Math.max(traits.align, kPointerSize),
					size: kPointerSize,
				},
			};

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