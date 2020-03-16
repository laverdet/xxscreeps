import { kPointerSize, alignTo, getTraits, Layout, Shape, StructLayout } from './layout';
import type { BufferView } from './buffer-view';
import { RecursiveWeakMemoize } from '~/lib/memoize';

export type WriteInterceptor = {
	decompose?: (value: any) => any;
	decomposeIntoBuffer?: (value: any, view: BufferView, offset: number) => number;
	symbol?: symbol;
};
export type WriteInterceptors = Dictionary<WriteInterceptor>;
export type WriteInterceptorSchema = Dictionary<WriteInterceptors>;
export type BoundWriteInterceptorSchema = WeakMap<StructLayout, WriteInterceptors>;

type Writer<Type = any> = (value: Type, view: BufferView, offset: number) => number;
type MemberWriter = (value: any, view: BufferView, offset: number, locals: number) => number;

const getMemberWriter = RecursiveWeakMemoize([ 0, 1 ],
		(layout: StructLayout, interceptorSchema: BoundWriteInterceptorSchema): MemberWriter => {

	let memberWriter: MemberWriter | undefined;
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make writer for single field. `locals` parameter is offset to dynamic memory.
		const next = function(): MemberWriter {
			// Get writer for this member
			const write = function(): Writer {
				const write = getWriter(member.layout, interceptorSchema);

				// Has decomposer?
				const decompose = interceptors?.[key]?.decompose;
				if (decompose !== undefined) {
					return (value, view, offset) => write(decompose(value), view, offset);
				}
				const decomposeIntoBuffer = interceptors?.[key]?.decomposeIntoBuffer;
				if (decomposeIntoBuffer !== undefined) {
					return (value, view, offset) => decomposeIntoBuffer(value, view, offset);
				}

				// Plain writer
				return write;
			}();

			// Wrap to write this field at reserved address
			const { offset, pointer } = member;
			if (pointer === true) {
				const { align } = getTraits(layout);
				return (value, view, instanceOffset, locals) => {
					const addr = alignTo(instanceOffset + locals, align);
					view.uint32[instanceOffset + offset >>> 2] = addr;
					return addr + write(value[symbol], view, addr);
				};
			} else {
				return (value, view, instanceOffset, locals) =>
					((write(value[symbol], view, instanceOffset + offset), locals));
			}
		}();

		// Combine member writers
		const prev = memberWriter;
		if (prev === undefined) {
			memberWriter = next;
		} else {
			memberWriter = (value, view, offset, locals) =>
				next(value, view, offset, prev(value, view, offset, locals));
		}
	}
	return memberWriter!;
});

const memoizeGetWriter = RecursiveWeakMemoize([ 0, 1 ],
		(layout: Layout, interceptorSchema: BoundWriteInterceptorSchema): Writer => {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (value, view, offset) => ((view.int8[offset] = value, 1));
			case 'int16': return (value, view, offset) => ((view.int16[offset >>> 1] = value, 2));
			case 'int32': return (value, view, offset) => ((view.int32[offset >>> 2] = value, 4));

			case 'uint8': return (value, view, offset) => ((view.uint8[offset] = value, 1));
			case 'uint16': return (value, view, offset) => ((view.uint16[offset >>> 1] = value, 2));
			case 'uint32': return (value, view, offset) => ((view.uint32[offset >>> 2] = value, 4));

			case 'string': return (value: string, view, offset) => {
				// Write string length
				const { length } = value;
				view.uint32[offset >>> 2] = length;
				// Write string data
				const stringOffset = offset + kPointerSize >>> 1;
				const { uint16 } = view;
				for (let ii = 0; ii < length; ++ii) {
					uint16[stringOffset + ii] = value.charCodeAt(ii);
				}
				return (length << 1) + kPointerSize;
			};

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}

	} else if ('array' in layout) {
		// Array types
		const arraySize = layout.size;
		const elementLayout = layout.array;
		const write = getWriter(elementLayout, interceptorSchema);
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
				return size;
			};
		}

	} else if ('vector' in layout) {
		const elementLayout = layout.vector;
		const write = getWriter(elementLayout, interceptorSchema);
		const { size, stride } = getTraits(elementLayout);
		if (stride === undefined) {
			// Vector with dynamic element size
			return (value, view, offset) => {
				const { length } = value;
				view.uint32[offset >>> 2] = length;
				if (length === 0) {
					return kPointerSize;
				} else {
					let currentOffset = offset + kPointerSize;
					let totalSize = 0;
					const lengthMinusOne = length - 1;
					for (let ii = 0; ii < lengthMinusOne; ++ii) {
						const elementOffset = currentOffset + kPointerSize;
						const size = alignTo(write(value[ii], view, elementOffset), kPointerSize);
						totalSize += size;
						currentOffset = view.uint32[currentOffset >>> 2] = elementOffset + size;
					}
					totalSize += write(value[lengthMinusOne], view, currentOffset);
					return totalSize;
				}
			};

		} else {
			// Vector with fixed element size
			return (value, view, offset) => {
				// Write length header
				const { length } = value;
				view.uint32[offset >>> 2] = length;
				if (length === 0) {
					return kPointerSize;
				} else {
					// Write vector data
					let currentOffset = offset + kPointerSize;
					// Note: no need to align because max alignment is already `kPointerSize`. Theoretically
					// this would need to be implemented if 64-bit data types were added.
					// currentOffset = alignTo(currentOffset, align);
					write(value[0], view, currentOffset);
					for (let ii = 1; ii < length; ++ii) {
						currentOffset += stride;
						write(value[ii], view, currentOffset);
					}
					// Final element is `size` instead of `stride` because we don't need to align the next
					// element
					return currentOffset - offset + size;
				}
			};
		}

	} else {
		// Structures
		const write = getMemberWriter(layout, interceptorSchema);
		const { size } = getTraits(layout);
		if (layout.inherit === undefined) {
			return (value, view, offset) => write(value, view, offset, offset + size);
		} else {
			const writeBase = getMemberWriter(layout.inherit, interceptorSchema);
			return (value, view, offset) =>
				write(value, view, offset, writeBase(value, view, offset, offset + size));
		}
	}
});

export function getWriter<Type extends Layout>(
	layout: Type, interceptorSchema: BoundWriteInterceptorSchema
): Writer<Shape<Type>>;
export function getWriter(layout: Layout, interceptorSchema: BoundWriteInterceptorSchema) {
	return memoizeGetWriter(layout, interceptorSchema);
}
