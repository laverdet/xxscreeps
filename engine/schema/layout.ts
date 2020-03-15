// This specifies memory layout in a hopefully stable format
export type Integral = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';

export type StructLayout = {
	struct: Record<string, {
		layout: Layout;
		offset: number;
		pointer?: true;
	}>;
	inherit?: StructLayout;
};

type ArrayLayout = {
	array: Layout;
	size: number;
};

type VectorLayout = {
	vector: Layout;
};

export type Layout = Integral | StructLayout | ArrayLayout | VectorLayout;

export type Traits = {
	align: number;
	size: number;
	stride?: number;
};

// Convert a memory layout declaration to the corresponding data type
type ArrayShape<Type extends ArrayLayout> = Shape<Type['array']>[];
type VectorShape<Type extends VectorLayout> = Shape<Type['vector']>[];
type StructShape<Type extends StructLayout> = {
	[Key in keyof Type['struct']]: Shape<Type['struct'][Key]['layout']>;
};
export type Shape<Type extends Layout> =
	Type extends Integral ? number :
	Type extends ArrayLayout ? ArrayShape<Type> :
	Type extends VectorLayout ? VectorShape<Type> :
	Type extends StructLayout ? StructShape<Type> : never;

export const kPointerSize = 4;

export function alignTo(address: number, align: number) {
	const remainder = address % align;
	return address + (remainder === 0 ? 0 : align - remainder);
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

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}

	} else if ('array' in layout) {
		// Fixed size array
		const arraySize = layout.size;
		const elementLayout = layout.array;
		const { align, size, stride } = getTraits(elementLayout);
		return {
			align: align,
			size: size * arraySize,
			...stride && {
				stride: stride * (arraySize - 1) + size,
			},
		};

	} else if ('vector' in layout) {
		// Dynamic vector
		const { align } = getTraits(layout.vector);
		return {
			align: Math.max(kPointerSize, align),
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
				Math.max(member.pointer ? kPointerSize : 0, member.traits.align)
			)),
			size: Math.max(...members.map(member =>
				member.offset + (member.pointer ? kPointerSize : member.traits.size)
			)),
		};
		const hasPointerElement = members.some(member => member.pointer);
		let isFixedSize = !hasPointerElement;
		if (layout.inherit) {
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
