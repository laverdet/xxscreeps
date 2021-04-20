import { Implementation } from 'xxscreeps/utility/types';
import { getOrSet, staticCast } from 'xxscreeps/utility/utility';
import { ConstantFormat, EnumFormat, Format, Interceptor, Primitive, Variant } from './format';
import { entriesWithSymbols } from './symbol';

export const kPointerSize = 4;
export const kHeaderSize = kPointerSize * 4;
export const kMagic = 0xfff35a00;

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
	stride: number;
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
	size: number;
} | {
	pointer: Layout;
	align: number;
	size: number;
};

export type StructLayout = {
	struct: Record<string | symbol, {
		offset: number;
		member: Layout;
	}>;
	inherit?: StructLayout;
	variant?: number | string;
};

type VariantLayout = {
	variant: {
		align: number;
		layout: StructLayout;
		size: number;
	}[];
};

type VectorLayout = {
	list: Layout;
	align: number;
	size: number;
} | {
	vector: Layout;
	align: number;
	size: number;
};

export type Traits = {
	align: number;
	size: number;
	stride?: number;
};

export type LayoutAndTraits = { layout: Layout; traits: Traits };

export function getLayout(unresolvedFormat: Format, cache: Map<Format, LayoutAndTraits>): LayoutAndTraits {
	return getOrSet(cache, unresolvedFormat, () => getResolvedLayout(resolve(unresolvedFormat), cache));
}

function getResolvedLayout(format: Format, cache: Map<Format, LayoutAndTraits>): LayoutAndTraits {
	return getOrSet(cache, format, () => {
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
				layout: staticCast<ArrayLayout>({
					array: layout,
					length,
					stride: traits.stride,
				}),
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
				layout: staticCast<ComposedLayout>({
					composed: layout,
					interceptor,
				}),
				traits,
			};

		} else if ('constant' in format) {
			return {
				layout: staticCast<ConstantLayout>(format),
				traits: { align: 1, size: 0, stride: 0 },
			};

		} else if ('enum' in format) {
			return {
				layout: staticCast<EnumLayout>(format),
				traits: { align: 1, size: 1, stride: 1 },
			};

		} else if ('named' in format) {
			const { layout, traits } = getLayout(format.format, cache);
			return {
				layout: staticCast<NamedLayout>({
					named: format.named,
					layout,
				}),
				traits,
			};

		} else if ('optional' in format) {
			const { layout, traits } = getLayout(format.optional, cache);
			if (traits.size <= kPointerSize * 2) {
				return {
					layout: staticCast<OptionalLayout>({
						optional: layout,
						size: traits.size,
					}),
					traits: {
						align: traits.align,
						size: traits.size + 1,
						stride: traits.stride && alignTo(traits.size + 1, traits.align),
					},
				};
			} else {
				return {
					layout: staticCast<OptionalLayout>({
						pointer: layout,
						align: traits.align,
						size: traits.size,
					}),
					traits: {
						align: kPointerSize,
						size: kPointerSize,
					},
				};
			}

		} else if ('struct' in format) {
			// Grab layout for structure members
			const members = entriesWithSymbols(format.struct)
				.filter(entry => entry[0] !== Variant)
				.map(([ key, member ]) => ({
					key,
					...getLayout(member, cache),
				}));

			// Simple struct pack algorithm by sorting by size largest to smallest
			members.sort((left, right) => {
				const nameOf = (el: string | symbol) => typeof el === 'string' ? el : el.description ?? '';
				return (
					right.traits.size - left.traits.size ||
					nameOf(left.key).localeCompare(nameOf(right.key))
				);
			});

			// Arrange member layout
			const baseLayout = format.inherit && getLayout(format.inherit, cache);
			let offset = baseLayout?.traits.size ?? 0;
			const arrangedMembers = members.map(member => {
				const { layout, traits } = member;
				const memberOffset = alignTo(offset, traits.align);
				offset += traits.size;
				return {
					key: member.key,
					info: {
						offset: memberOffset,
						member: layout,
					},
					traits,
				};
			});

			// Calculate struct traits
			const align = Math.max(...arrangedMembers.map(member => member.traits.align));
			const lastMember = arrangedMembers[arrangedMembers.length - 1];
			const size = lastMember.info.offset + lastMember.traits.size;
			const isFixedSize = (!baseLayout || baseLayout.traits.stride !== undefined) &&
				members.every(member => member.traits.stride !== undefined);
			return {
				layout: staticCast<StructLayout>({
					struct: Object.fromEntries(arrangedMembers.map(member => [ member.key, member.info ])),
					inherit: baseLayout?.layout as StructLayout,
					variant: format.variant,
				}),
				traits: {
					align,
					size,
					stride: isFixedSize ? alignTo(size, align) : undefined,
				},
			};

		} else if ('variant' in format) {
			return {
				layout: staticCast<VariantLayout>({
					variant: format.variant.map(variant => {
						const { layout, traits } = getLayout(variant, cache);
						return {
							layout: layout as StructLayout,
							align: traits.align,
							size: traits.size,
						};
					}),
				}),
				traits: {
					align: kPointerSize,
					size: kPointerSize + 1,
				},
			};

		} else if ('vector' in format) {
			const { layout, traits } = getLayout(format.vector, cache);
			if (traits.stride === undefined) {
				return {
					layout: staticCast<VectorLayout>({
						list: layout,
						align: traits.align,
						size: traits.size,
					}),
					traits: {
						align: kPointerSize,
						size: kPointerSize,
					},
				};
			} else {
				return {
					layout: staticCast<VectorLayout>({
						vector: layout,
						align: traits.align,
						size: traits.size,
					}),
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
