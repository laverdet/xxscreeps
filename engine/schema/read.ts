import { kPointerSize, getTraits, Layout, Shape, StructLayout } from './layout';
import type { BufferView } from './buffer-view';
import { RecursiveWeakMemoize } from '~/lib/memoize';
const { fromCharCode } = String;

export type ReadInterceptor = {
	compose?: (value: any) => any;
	composeFromBuffer?: (view: BufferView, offset: number) => any;
	symbol?: symbol;
};
export type ReadInterceptors = Dictionary<ReadInterceptor>;
export type ReadInterceptorSchema = Dictionary<ReadInterceptors>;
export type BoundReadInterceptorSchema = WeakMap<StructLayout, ReadInterceptors>;

export type Reader<Type = any> = (view: BufferView, offset: number) => Type;
type MemberReader = (value: any, view: BufferView, offset: number) => void;

export const getSingleMemberReader = RecursiveWeakMemoize([ 0, 1 ],
		(
			key: string,
			layout: Layout,
			interceptors: ReadInterceptors | undefined,
			interceptorSchema: BoundReadInterceptorSchema,
		): Reader => {

	// Make underlying reader
	const read = getReader(layout, interceptorSchema);

	// Has composer?
	const compose = interceptors?.[key]?.compose;
	if (compose !== undefined) {
		return (view, offset) => compose(read(view, offset));
	}
	const composeFromBuffer = interceptors?.[key]?.composeFromBuffer;
	if (composeFromBuffer !== undefined) {
		return (view, offset) => composeFromBuffer(view, offset);
	}

	// Plain reader
	return read;
});

const getMemberReader = RecursiveWeakMemoize([ 0, 1 ],
		(layout: StructLayout, interceptorSchema: BoundReadInterceptorSchema): MemberReader => {

	let memberReader: MemberReader | undefined;
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make reader for single field
		const next = function(): MemberReader {
			// Get reader for this member
			const read = getSingleMemberReader(key, member.layout, interceptors, interceptorSchema);

			// Wrap to read this field from reserved address
			const { offset, pointer } = member;
			if (pointer === true) {
				return (value, view, instanceOffset) => {
					const addr = view.uint32[instanceOffset + offset >>> 2];
					value[symbol] = read(view, addr);
				};
			} else {
				return (value, view, instanceOffset) => {
					value[symbol] = read(view, instanceOffset + offset);
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

const memoizeGetReader = RecursiveWeakMemoize([ 0, 1 ],
		(layout: Layout, interceptorSchema: BoundReadInterceptorSchema): Reader => {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (view, offset) => view.int8[offset];
			case 'int16': return (view, offset) => view.int16[offset >>> 1];
			case 'int32': return (view, offset) => view.int32[offset >>> 2];

			case 'uint8': return (view, offset) => view.uint8[offset];
			case 'uint16': return (view, offset) => view.uint16[offset >>> 1];
			case 'uint32': return (view, offset) => view.uint32[offset >>> 2];

			case 'string': return (view, offset) => {
				const stringOffset = offset + kPointerSize >>> 1;
				return fromCharCode(...view.uint16.slice(stringOffset, stringOffset + view.uint32[offset >>> 2]));
			};

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
		const { stride } = getTraits(elementLayout);
		if (stride === undefined) {
			// Vector with dynamic element size
			return (view, offset) => {
				const length = view.uint32[offset >>> 2];
				if (length === 0) {
					return 0;
				} else {
					const value: any[] = [];
					let currentOffset = offset + kPointerSize;
					for (let ii = 0; ii < length; ++ii) {
						value.push(read(view, currentOffset + kPointerSize));
						currentOffset = view.uint32[currentOffset >>> 2];
					}
					return value;
				}
			};

		} else {
			// Vector with fixed element size
			return (view, offset) => {
				const length = view.uint32[offset >>> 2];
				if (length === 0) {
					return [];
				} else {
					const value: any[] = [];
					let currentOffset = offset + kPointerSize;
					value.push(read(view, currentOffset));
					for (let ii = 1; ii < length; ++ii) {
						currentOffset += stride;
						value.push(read(view, currentOffset));
					}
					return value;
				}
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

export function getReader<Type extends Layout>(
	layout: Type, interceptorSchema: BoundReadInterceptorSchema
): Reader<Shape<Type>>;
export function getReader(layout: Layout, interceptorSchema: BoundReadInterceptorSchema) {
	return memoizeGetReader(layout, interceptorSchema);
}
