import { BoundSchema } from './interceptor';

// This specifies memory layout in a hopefully stable format
export type Integral = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';
export type Primitive = Integral | 'string' | 'bool';

export type StructLayout = {
	inherit?: StructLayout;
	'variant!'?: string;
	struct: Record<string, {
		layout: Layout;
		offset: number;
		pointer?: true;
	}>;
};

type ArrayLayout = {
	array: Layout;
	size: number;
};

type EnumLayout = {
	enum: any[];
};

type HolderLayout = {
	holder: Layout;
};

type OptionalLayout = {
	optional: Layout;
};

type VariantLayout = {
	variant: StructLayout[];
};

type VectorLayout = {
	vector: Layout;
};

export type Layout = Primitive | BoundSchema & (
	ArrayLayout | EnumLayout | HolderLayout | OptionalLayout | StructLayout | VariantLayout | VectorLayout
);

export type Traits = {
	align: number;
	size: number;
	stride?: number;
};

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

	} else if ('enum' in layout) {
		// Enum is just a byte
		return { align: 1, size: 1, stride: 1 };

	} else if ('holder' in layout) {
		// Pass through to underlying primitive
		return getTraits(layout.holder);

	} else if ('optional' in layout) {
		// Optional puts a flag at the beginning or end of a layout. End is better but can only be use
		// for constant size elements.
		const { align, size, stride } = getTraits(layout.optional);
		if (stride === undefined) {
			return {
				align: Math.max(kPointerSize, align),
				size: alignTo(size + kPointerSize, align),
			};
		} else {
			return {
				align,
				size: size + 1,
				stride: alignTo(size + 1, align),
			};
		}

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

// Recursively unpacks holder layout created by `declare`
export function unpackHolder(layout: Layout) {
	let unpacked: any = layout;
	while (unpacked.holder !== undefined) {
		unpacked = unpacked.holder;
	}
	return unpacked;
}
