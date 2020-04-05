import type { BufferObject } from './buffer-object';
import { BufferView } from './buffer-view';
import { getLayout, Format, TypeOf, Variant } from './format';
import { defaultInterceptorLookup, InterceptorLookup } from './interceptor';
import { kPointerSize, getTraits, unpackHolder, Layout, StructLayout } from './layout';
import { RecursiveWeakMemoize } from '~/lib/memoize';
const { fromCharCode } = String;

type Reader<Type = any> = (view: Readonly<BufferView>, offset: number) => Type;
type MemberReader = (value: any, view: Readonly<BufferView>, offset: number) => void;

const getMemberReader = RecursiveWeakMemoize([ 0, 1 ],
	(layout: StructLayout, lookup: InterceptorLookup): MemberReader => {

		let readMembers: MemberReader | undefined;
		for (const [ key, member ] of Object.entries(layout.struct)) {
			const symbol = lookup.symbol(member.layout) ?? key;

			// Make reader for single field
			const next = function(): MemberReader {
				// Get reader for this member
				const read = getTypeReader(member.layout, lookup);

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
			const prev = readMembers;
			if (prev === undefined) {
				readMembers = next;
			} else {
				readMembers = (value, view, offset) => {
					prev(value, view, offset);
					next(value, view, offset);
				};
			}
		}
		return readMembers!;
	},
);

export const getTypeReader = RecursiveWeakMemoize([ 0, 1 ], (layout: Layout, lookup: InterceptorLookup): Reader => {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (view, offset) => view.int8[offset];
			case 'int16': return (view, offset) => view.int16[offset >>> 1];
			case 'int32': return (view, offset) => view.int32[offset >>> 2];

			case 'uint8': return (view, offset) => view.uint8[offset];
			case 'uint16': return (view, offset) => view.uint16[offset >>> 1];
			case 'uint32': return (view, offset) => view.uint32[offset >>> 2];

			case 'bool': return (view, offset) => view.int8[offset] !== 0;

			case 'string': return (view, offset) => {
				const length = view.int32[offset >>> 2];
				if (length > 0) {
					const stringOffset = offset + kPointerSize;
					return fromCharCode(...view.int8.slice(stringOffset, stringOffset + length));
				} else if (length < 0) {
					const stringOffset16 = offset + kPointerSize >>> 1;
					return fromCharCode(...view.uint16.slice(stringOffset16, stringOffset16 - length));
				} else {
					return '';
				}
			};

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}
	}

	// Fetch reader for non-literal type
	const read = function(): Reader {
		if ('array' in layout) {
			// Array types
			const arraySize = layout.size;
			const elementLayout = layout.array;
			const read = getTypeReader(elementLayout, lookup);
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

		} else if ('enum' in layout) {
			// Enumerated types
			const { enum: values } = layout;
			return (view, offset) => values[view.uint8[offset]];

		} else if ('holder' in layout) {
			// Pass through to underlying type
			return getTypeReader(layout.holder, lookup);

		} else if ('optional' in layout) {
			// Optional types
			const elementLayout = layout.optional;
			const read = getTypeReader(elementLayout, lookup);
			const { size, stride } = getTraits(elementLayout);

			if (stride === undefined) {
				// Dynamic size element. Flag is pointer to memory (just 4 bytes ahead)
				return (view, offset) => {
					const addr = view.uint32[offset >>> 2];
					if (addr === 0) {
						return undefined;
					} else {
						return read(view, addr);
					}
				};
			} else {
				// Fixed size element. Flag is 1 byte at end of structure.
				return (view, offset) => {
					if (view.int8[offset + size] === 0) {
						return undefined;
					} else {
						return read(view, offset);
					}
				};
			}

		} else if ('variant' in layout) {
			// Variant types
			const variantReaders = layout.variant.map(elementLayout =>
				getTypeReader(elementLayout, lookup));
			return (view, offset) => variantReaders[view.uint32[offset >>> 2]](view, offset + kPointerSize);

		} else if ('vector' in layout) {
			const elementLayout = layout.vector;
			const read = getTypeReader(elementLayout, lookup);
			const { stride } = getTraits(elementLayout);
			if (stride === undefined) {
				// Vector with dynamic element size
				return (view, offset) => {
					const length = view.uint32[offset >>> 2];
					if (length === 0) {
						return [];
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
			// Structures / object
			const variant = layout['variant!'];
			const { inherit } = layout;
			const readBase = inherit === undefined ?
				undefined : getMemberReader(unpackHolder(inherit), lookup);
			const read = getMemberReader(layout, lookup);
			return (view, offset) => {
				const value = variant === undefined ? {} : { [Variant]: variant };
				if (readBase !== undefined) {
					readBase(value, view, offset);
				}
				read(value, view, offset);
				return value;
			};
		}
	}();

	// Has composer?
	const interceptors = lookup.interceptor(layout);
	const compose = interceptors?.compose;
	if (compose !== undefined) {
		return (view, offset) => compose(read(view, offset));
	}
	const composeFromBuffer = interceptors?.composeFromBuffer;
	if (composeFromBuffer !== undefined) {
		return (view, offset) => composeFromBuffer(view, offset);
	}
	const overlay = interceptors?.overlay;
	if (overlay !== undefined) {
		return (view, offset) => new (overlay as Constructor<BufferObject>)(view, offset);
	}
	return read;
});

export function getReader<Type extends Format>(format: Type, lookup = defaultInterceptorLookup) {
	const layout = getLayout(format);
	const read = getTypeReader(layout, lookup);
	return (buffer: Readonly<Uint8Array>): TypeOf<Type> => {
		const view = BufferView.fromTypedArray(buffer);
		return read(view, 0);
	};
}
