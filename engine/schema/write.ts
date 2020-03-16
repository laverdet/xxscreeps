import { kPointerSize, alignTo, getTraits, Layout, Shape, StructLayout } from './layout';
import type { BufferView } from './buffer-view';
import { RecursiveWeakMemoize } from '~/lib/memoize';

export type WriteInterceptor = {
	decompose?: (value: any) => any;
	symbol?: symbol;
};
export type WriteInterceptors = Dictionary<WriteInterceptor>;
export type WriteInterceptorSchema = Dictionary<WriteInterceptors>;
export type BoundWriteInterceptorSchema = WeakMap<StructLayout, WriteInterceptors>;

type MemberWriter = (value: any, view: BufferView, offset: number, locals: number) => number;
const memoizeGetMemberWriter = RecursiveWeakMemoize([ 0, 1 ],
		(layout: StructLayout, interceptorSchema: BoundWriteInterceptorSchema): MemberWriter => {

	let memberWriter: MemberWriter | undefined;
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make writer for single field. `locals` parameter is offset to dynamic memory.
		const next = function(): MemberWriter {
			// Get writer for this member
			let write = getWriter(member.layout, interceptorSchema);
			const decompose = interceptors?.[key]?.decompose;
			if (decompose !== undefined) {
				const realWrite = write;
				write = (value, view, offset) => realWrite(decompose(value), view, offset);
			}

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

function getMemberWriter(layout: StructLayout, interceptorSchema: BoundWriteInterceptorSchema) {
	return memoizeGetMemberWriter(layout, interceptorSchema);
}

const memoizeGetWriter = RecursiveWeakMemoize([ 0, 1 ],
		(layout: Layout, interceptorSchema: BoundWriteInterceptorSchema):
			((value: any, view: BufferView, offset: number) => number) => {

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
			throw new TypeError('Unimplemented');

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
					currentOffset += size;
					return currentOffset - offset;
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

export function getWriter<Type extends Layout>(layout: Type, interceptorSchema: BoundWriteInterceptorSchema):
	(value: Shape<Type>, view: BufferView, offset: number) => number;
export function getWriter(layout: Layout, interceptorSchema: BoundWriteInterceptorSchema) {
	return memoizeGetWriter(layout, interceptorSchema);
}
