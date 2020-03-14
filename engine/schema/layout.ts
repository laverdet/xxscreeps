import type { BufferView } from './buffer-view';
const { entries, values } = Object;

// This specifies memory layout in a hopefully stable format
export type Integral = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';

export type StructLayout = {
	struct: {
		[key: string]: {
			layout: Layout;
			offset: number;
			pointer?: true;
		};
	};
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
type Shape<Type extends Layout> =
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
		const members = values(layout.struct).map(member => ({
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

function getMemberWriter(layout: StructLayout):
		(value: Record<string, any>, view: BufferView, offset: number, locals: number) => number {
	let memberWriter: ReturnType<typeof getMemberWriter> | undefined;
	const members = entries(layout.struct);
	members.forEach(([ key, member ]) => {
		// Make writer for single field. Extra parameter is offset to dynamic memory.
		const next = function(): NonNullable<typeof memberWriter> {
			const write = getWriter(member.layout);
			const { offset, pointer } = member;
			if (pointer) {
				const { align } = getTraits(layout);
				return (value, view, instanceOffset, locals) => {
					const addr = alignTo(locals, align);
					view.uint32[(offset + instanceOffset) >>> 2] = addr;
					return locals + write(value[key], view, locals);
				};
			} else {
				return (value, view, instanceOffset, locals) =>
					(write(value[key], view, offset + instanceOffset), locals);
			}
		}();
		// Combine member writers
		const prev = memberWriter;
		if (prev) {
			memberWriter = (value, view, offset, locals) =>
				next(value, view, offset, prev(value, view, offset, locals));
		} else {
			memberWriter = next;
		}
	});
	return memberWriter!;
}

export function getWriter<Type extends Layout>(layout: Type):
		(value: Shape<Type>, view: BufferView, offset: number) => number
export function getWriter(layout: Layout):
		(value: any, view: BufferView, offset: number) => number {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (value, view, offset) => (view.int8[offset] = value, 1);
			case 'int16': return (value, view, offset) => (view.int16[offset >>> 1] = value, 2);
			case 'int32': return (value, view, offset) => (view.int32[offset >>> 2] = value, 4);

			case 'uint8': return (value, view, offset) => (view.uint8[offset] = value, 1);
			case 'uint16': return (value, view, offset) => (view.uint16[offset >>> 1] = value, 2);
			case 'uint32': return (value, view, offset) => (view.uint32[offset >>> 2] = value, 4);

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}

	} else if ('array' in layout) {
		// Array types
		const arraySize = layout.size;
		const elementLayout = layout.array;
		const write = getWriter(elementLayout);
		const { size, stride } = getTraits(elementLayout);
		if (stride === undefined) {
			throw new TypeError('Unimplemented');

		} else {
			// Array with fixed element size
			return (value, view, offset) => {
				let currentOffset = offset;
				write(value[0], view, currentOffset);
				for (let ii = 1; ii < arraySize; ++ii) {
					currentOffset += stride;
					write(value[ii], view, currentOffset);
				}
				return currentOffset + size - offset;
			};
		}

	} else if ('vector' in layout) {
		const elementLayout = layout.vector;
		const write = getWriter(elementLayout);
		const { align, size, stride } = getTraits(elementLayout);
		if (stride === undefined) {
			throw new TypeError('Unimplemented');

		} else {
			// Vector with fixed element size
			return (value, view, offset) => {
				const length: number = value.length;
				let currentOffset = alignTo(offset, kPointerSize);
				view.uint32[currentOffset >>> 2] = length; // write total length of vector
				currentOffset += kPointerSize;
				if (length !== 0) {
					currentOffset = alignTo(currentOffset, align);
					write(value[0], view, currentOffset);
					for (let ii = 1; ii < length; ++ii) {
						currentOffset += stride;
						write(value[ii], view, currentOffset);
					}
					currentOffset += size;
				}
				return currentOffset - offset;
			};
		}

	} else {
		// Structures
		const write = getMemberWriter(layout);
		const { size } = getTraits(layout);
		if (layout.inherit) {
			const writeBase = getMemberWriter(layout.inherit);
			return (value, view, offset) =>
				write(value, view, offset, writeBase(value, view, offset, size));
		} else {
			return (value, view, offset) => write(value, view, offset, size);
		}
	}
}
