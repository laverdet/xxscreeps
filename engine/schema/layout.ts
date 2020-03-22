import { Variant } from './format';

// This specifies memory layout in a hopefully stable format
export type Integral = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';
export type Primitive = Integral | 'string' | 'bool';

export type StructLayout = {
	inherit?: StructLayout;
	struct: Record<string, {
		layout: Layout;
		offset: number;
		pointer?: true;
	}>;
	[Variant]?: string;
};

type ArrayLayout = {
	array: Layout;
	size: number;
};

export type VariantLayout = {
	variant: StructLayout[];
};

type VectorLayout = {
	vector: Layout;
};

export type Layout = ArrayLayout | Primitive | StructLayout | VariantLayout | VectorLayout;

export type Traits = {
	align: number;
	size: number;
	stride?: number;
};

// Convert a memory layout declaration to the corresponding data type
type ArrayShape<Type extends ArrayLayout> = Shape<Type['array']>[];
// Somehow this one creates a circular type but none of the others do.
// type VariantShape<Type extends VariantLayout> = Shape<Type['variant'][number]>;
type VectorShape<Type extends VectorLayout> = Shape<Type['vector']>[];
type StructShape<Type extends StructLayout> = {
	[Key in keyof Type['struct']]: Shape<Type['struct'][Key]['layout']>;
};
export type Shape<Type extends Layout> =
	Type extends Integral ? number :
	Type extends 'bool' ? boolean :
	Type extends 'string' ? string :
	Type extends ArrayLayout ? ArrayShape<Type> :
	Type extends VariantLayout ? any :
	Type extends VectorLayout ? VectorShape<Type> :
	Type extends StructLayout ? StructShape<Type> : never;

export const kPointerSize = 4;

export function alignTo(address: number, align: number) {
	const alignMinusOne = align - 1;
	return ~alignMinusOne & (address + alignMinusOne);
}

export function getTraits(layout: Layout): Traits {
	if (typeof layout === 'string') {
		// Integral types
		const integerTraits = (sizeof: number) =>
			({ align: sizeof, size: sizeof, stride: sizeof });
		switch (layout) {
			case 'int8': return integerTraits(1);
			case 'int16': return integerTraits(2);
			case 'int32': return integerTraits(4);

			case 'uint8': return integerTraits(1);
			case 'uint16': return integerTraits(2);
			case 'uint32': return integerTraits(4);

			case 'bool': return integerTraits(1);

			case 'string': return {
				align: kPointerSize,
				size: kPointerSize,
			};

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}

	} else if ('array' in layout) {
		// Fixed size array
		const arraySize = layout.size;
		const elementLayout = layout.array;
		const { align, size, stride } = getTraits(elementLayout);
		return {
			align,
			size: size * arraySize,
			...stride !== undefined && {
				stride: stride * (arraySize - 1) + size,
			},
		};

	} else if ('variant' in layout || 'vector' in layout) {
		// Variant & vector just store a uint32 in static memory, the rest is dynamic
		return {
			align: kPointerSize,
			size: kPointerSize,
		};

	} else {
		// Structures
		const members = Object.values(layout.struct).map(member => ({
			...member,
			traits: getTraits(member.layout),
		}));
		const traits: Traits = {
			align: Math.max(...members.map(member =>
				member.pointer === true ? kPointerSize : member.traits.align,
			)),
			size: Math.max(...members.map(member =>
				member.offset + (member.pointer === true ? kPointerSize : member.traits.size),
			)),
		};
		const hasPointerElement = members.some(member => member.pointer);
		let isFixedSize = !hasPointerElement;
		if (layout.inherit !== undefined) {
			const baseTraits = getTraits(layout.inherit);
			traits.align = Math.max(traits.align, baseTraits.align);
			isFixedSize = isFixedSize && baseTraits.stride !== undefined;
		}
		if (isFixedSize) {
			traits.stride = alignTo(traits.size, traits.align);
		}
		return traits;
	}
}
