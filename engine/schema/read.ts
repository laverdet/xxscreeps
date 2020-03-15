import { kPointerSize, alignTo, getTraits, Layout, Shape, StructLayout } from './layout';
import type { BufferView } from './buffer-view';
import { RecursiveWeakMemoize } from '~/lib/memoize';

export type ReadInterceptor = {
	compose?: (value: any) => any;
	symbol?: symbol;
};
export type ReadInterceptors = Dictionary<ReadInterceptor>;
export type ReadInterceptorSchema = Dictionary<ReadInterceptors>;
export type BoundReadInterceptorSchema = WeakMap<StructLayout, ReadInterceptors>;

type MemberReader = (value: any, view: BufferView, offset: number) => void;
const memoizeGetMemberReader = RecursiveWeakMemoize([ 0, 1 ],
		(layout: StructLayout, interceptorSchema: BoundReadInterceptorSchema): MemberReader => {

	let memberReader: MemberReader | undefined;
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make reader for single field
		const next = function(): MemberReader {
			// Get reader for this member
			let read = getReader(member.layout, interceptorSchema);
			const compose = interceptors?.[key]?.compose;
			if (compose !== undefined) {
				const realRead = read;
				read = (view, offset) => compose(realRead(view, offset));
			}

			// Wrap to read this field from reserved address
			const { offset, pointer } = member;
			if (pointer === true) {
				return (value, view, instanceOffset) => {
					const addr = view.uint32[offset + instanceOffset >>> 2];
					value[symbol] = read(view, offset + addr);
				};
			} else {
				return (value, view, instanceOffset) => {
					value[symbol] = read(view, offset + instanceOffset);
				};
			}
		}();

		// Combine member readers
		const prev = memberReader;
		if (prev === undefined) {
			memberReader = next;
		} else {
			memberReader = (value, view, offset) => {
				prev(value, view, offset);
				next(value, view, offset);
			};
		}
	}
	return memberReader!;
});

function getMemberReader(layout: StructLayout, interceptorSchema: BoundReadInterceptorSchema) {
	return memoizeGetMemberReader(layout, interceptorSchema);
}

const memoizeGetReader = RecursiveWeakMemoize([ 0, 1 ],
		(layout: Layout, interceptorSchema: BoundReadInterceptorSchema):
			((view: BufferView, offset: number) => any) => {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (view, offset) => view.int8[offset];
			case 'int16': return (view, offset) => view.int16[offset >>> 1];
			case 'int32': return (view, offset) => view.int32[offset >>> 2];

			case 'uint8': return (view, offset) => view.uint8[offset];
			case 'uint16': return (view, offset) => view.uint16[offset >>> 1];
			case 'uint32': return (view, offset) => view.uint32[offset >>> 2];

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}

	} else if ('array' in layout) {
		// Array types
		const arraySize = layout.size;
		const elementLayout = layout.array;
		const read = getReader(elementLayout, interceptorSchema);
		const { stride } = getTraits(elementLayout);
		if (stride === undefined) {
			throw new TypeError('Unimplemented');

		} else {
			// Array with fixed element size
			return (view, offset) => {
				const value: any[] = [];
				let currentOffset = offset;
				value.push(read(view, currentOffset));
				for (let ii = 1; ii < arraySize; ++ii) {
					currentOffset += stride;
					value.push(read(view, currentOffset));
				}
				return value;
			};
		}

	} else if ('vector' in layout) {
		const elementLayout = layout.vector;
		const read = getReader(elementLayout, interceptorSchema);
		const { align, stride } = getTraits(elementLayout);
		if (stride === undefined) {
			throw new TypeError('Unimplemented');

		} else {
			// Vector with fixed element size
			return (view, offset) => {
				const value: any[] = [];
				let currentOffset = alignTo(offset, kPointerSize);
				const length = view.uint32[currentOffset >>> 2];
				currentOffset += kPointerSize;
				if (length !== 0) {
					currentOffset = alignTo(currentOffset, align);
					value.push(read(view, currentOffset));
					for (let ii = 1; ii < length; ++ii) {
						currentOffset += stride;
						value.push(read(view, currentOffset));
					}
				}
				return value;
			};
		}

	} else {
		// Structures
		const read = getMemberReader(layout, interceptorSchema);
		if (layout.inherit === undefined) {
			return (view, offset) => {
				const value = {};
				read(value, view, offset);
				return value;
			};
		} else {
			const readBase = getMemberReader(layout.inherit, interceptorSchema);
			return (view, offset) => {
				const value = {};
				readBase(value, view, offset);
				read(value, view, offset);
				return value;
			};
		}
	}
});

export function getReader<Type extends Layout>(layout: Type, interceptorSchema: BoundReadInterceptorSchema):
	(view: BufferView, offset: number) => Shape<Type>;
export function getReader(layout: Layout, interceptorSchema: BoundReadInterceptorSchema) {
	return memoizeGetReader(layout, interceptorSchema);
}
