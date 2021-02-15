import { BufferView } from './buffer-view';
import { getLayout, Format, ShapeOf, Variant } from './format';
import { defaultInterceptorLookup, InterceptorLookup } from './interceptor';
import { kPointerSize, alignTo, getTraits, unpackHolder, Layout, StructLayout } from './layout';
import { runOnce, RecursiveWeakMemoize } from 'xxscreeps/util/memoize';

type Writer<Type = any> = (value: Type, view: BufferView, offset: number) => number;
type MemberWriter = (value: any, view: BufferView, offset: number, locals: number) => number;

const getMemberWriter = RecursiveWeakMemoize([ 0, 1 ],
	(layout: StructLayout, lookup: InterceptorLookup): MemberWriter => {

		let writeMembers: MemberWriter | undefined;
		for (const [ key, member ] of Object.entries(layout.struct)) {
			const symbol = lookup.symbol(member.layout) ?? key;

			// Make writer for single field. `locals` parameter is offset to dynamic memory.
			const next = function(): MemberWriter {
				// Get writer for this member
				const write = getTypeWriter(member.layout, lookup);

				// Wrap to write this field at reserved address
				const { offset, pointer } = member;
				if (pointer === true) {
					const { align } = getTraits(layout);
					return (value, view, instanceOffset, locals) => {
						const addr = alignTo(locals, align);
						view.uint32[instanceOffset + offset >>> 2] = addr;
						return addr + write(value[symbol], view, addr);
					};
				} else {
					return (value, view, instanceOffset, locals) =>
						((write(value[symbol], view, instanceOffset + offset), locals));
				}
			}();

			// Combine member writers
			const prev = writeMembers;
			if (prev === undefined) {
				writeMembers = next;
			} else {
				writeMembers = (value, view, offset, locals) =>
					next(value, view, offset, prev(value, view, offset, locals));
			}
		}

		// Run inheritance recursively
		const { inherit } = layout;
		if (inherit === undefined) {
			return writeMembers!;
		} else {
			const writeBase = getMemberWriter(unpackHolder(inherit), lookup);
			return (value, view, offset, locals) =>
				writeMembers!(value, view, offset, writeBase(value, view, offset, locals));
		}
	});

const getTypeWriter = RecursiveWeakMemoize([ 0, 1 ], (layout: Layout, lookup: InterceptorLookup): Writer => {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (value, view, offset) => ((view.int8[offset] = value, 1));
			case 'int16': return (value, view, offset) => ((view.int16[offset >>> 1] = value, 2));
			case 'int32': return (value, view, offset) => ((view.int32[offset >>> 2] = value, 4));

			case 'uint8': return (value, view, offset) => ((view.uint8[offset] = value, 1));
			case 'uint16': return (value, view, offset) => ((view.uint16[offset >>> 1] = value, 2));
			case 'uint32': return (value, view, offset) => ((view.uint32[offset >>> 2] = value, 4));

			case 'bool': return (value: boolean, view, offset) => ((view.int8[offset] = value ? 1 : 0, 1));

			case 'buffer': return (value: Uint8Array, view, offset) => {
				const { length } = value;
				view.int32[offset >>> 2] = length;
				view.uint8.set(value, offset + kPointerSize);
				return length + kPointerSize;
			};

			case 'string': return (value: string, view, offset) => {
				// Attempt to write as latin1 and fall back to utf-16 if needed
				const { length } = value;
				for (let ii = 0; ii < length; ++ii) {
					const code = value.charCodeAt(ii);
					const stringOffset = offset + kPointerSize;
					if (code < 0x80) {
						view.int8[stringOffset + ii] = code;
					} else {
						// UTF-16 wide characters
						const stringOffset16 = stringOffset >>> 1;
						for (let ii = 0; ii < length; ++ii) {
							view.uint16[stringOffset16 + ii] = value.charCodeAt(ii);
						}
						view.int32[offset >>> 2] = -length;
						return (length << 1) + kPointerSize;
					}
				}
				// Succeeded writing latin1
				view.int32[offset >>> 2] = length;
				return length + kPointerSize;
			};

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}
	}

	// Fetch reader for non-literal type
	const write = function(): Writer {
		if ('array' in layout) {
			// Array types
			const arraySize = layout.size;
			const elementLayout = layout.array;
			const write = getTypeWriter(elementLayout, lookup);
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

		} else if ('enum' in layout) {
			// Enumerated types
			const enumMap = new Map(layout.enum.map((value, ii) => [ value, ii ]));
			return (value, view, offset) => ((view.uint8[offset] = enumMap.get(value)!, 1));

		} else if ('holder' in layout) {
			// Pass through to underlying reference
			return getTypeWriter(layout.holder, lookup);

		} else if ('optional' in layout) {
			// Optional types
			const elementLayout = layout.optional;
			const write = getTypeWriter(elementLayout, lookup);
			const { align, size, stride } = getTraits(elementLayout);
			if (stride === undefined) {
				// Dynamic size element. Flag is pointer to memory (just 4 bytes ahead)
				return (value, view, offset) => {
					if (value === undefined) {
						view.uint32[offset >>> 2] = 0;
						return kPointerSize;
					} else {
						const addr = view.uint32[offset >>> 2] = alignTo(offset + kPointerSize, align);
						return write(value, view, addr) + kPointerSize;
					}
				};
			} else {
				// Fixed size element. Flag is 1 byte at end of structure.
				const sizePlusOne = size + 1;
				return (value, view, offset) => {
					if (value === undefined) {
						// Zero out the memory, including the flag
						const end = offset + sizePlusOne;
						for (let ii = offset; ii < end; ++ii) {
							view.int8[ii] = 0;
						}
						return sizePlusOne;
					} else {
						view.uint8[size] = 1;
						return write(value, view, offset) + 1;
					}
				};
			}

		} else if ('variant' in layout) {
			// Variant types
			const variantMap = new Map<string, Writer>();
			for (let ii = 0; ii < layout.variant.length; ++ii) {
				const elementLayout = unpackHolder(layout.variant[ii]);
				const write = getTypeWriter(elementLayout, lookup);
				variantMap.set(
					elementLayout['variant!']!,
					(value, view, offset) => {
						view.uint32[offset >>> 2] = ii;
						return kPointerSize + write(value, view, offset + kPointerSize);
					},
				);
			}
			return (value, view, offset) => variantMap.get(value[Variant])!(value, view, offset);

		} else if ('vector' in layout) {
			const elementLayout = layout.vector;
			const write = getTypeWriter(elementLayout, lookup);
			const { size, stride } = getTraits(elementLayout);
			if (stride === undefined) {
				// Vector with dynamic element size
				return (value, view, offset) => {
					let length = 0;
					let currentOffset = offset + kPointerSize;
					for (const element of value) {
						++length;
						const elementOffset = currentOffset + kPointerSize;
						const size = alignTo(write(element, view, elementOffset), kPointerSize);
						currentOffset = view.uint32[currentOffset >>> 2] = elementOffset + size;
					}
					view.uint32[offset >>> 2] = length;
					return currentOffset - offset;
				};

			} else {
				// Vector with fixed element size
				return (value, view, offset) => {
					let length = 0;
					let currentOffset = offset + kPointerSize;
					for (const element of value) {
						++length;
						write(element, view, currentOffset);
						currentOffset += stride;
					}
					view.uint32[offset >>> 2] = length;
					// Final element is `size` instead of `stride` because we don't need to align the next
					// element
					return currentOffset - offset + size - stride;
				};
			}

		} else {
			// Structures
			const { size } = getTraits(layout);
			const writeMembers = getMemberWriter(layout, lookup);
			return (value, view, offset) => writeMembers(value, view, offset, offset + size) - offset;
		}
	}();

	// Has decomposer?
	const interceptors = lookup.interceptor(layout);
	const decompose = interceptors?.decompose;
	if (decompose !== undefined) {
		return (value, view, offset) => write(decompose(value), view, offset);
	}
	const decomposeIntoBuffer = interceptors?.decomposeIntoBuffer;
	if (decomposeIntoBuffer !== undefined) {
		return (value, view, offset) => decomposeIntoBuffer(value, view, offset);
	}
	return write;
});

const bufferCache = runOnce(() => BufferView.fromTypedArray(new Uint8Array(1024 * 1024 * 16)));

export function getWriter<Type extends Format>(format: Type, lookup = defaultInterceptorLookup) {
	const layout = getLayout(format);
	const write = getTypeWriter(layout, lookup);
	return (value: ShapeOf<Type>): Readonly<Uint8Array> => {
		const view = bufferCache();
		const length = write(value, view, 0);
		if (length > view.int8.length) {
			throw new Error('Exceeded memory write buffer');
		}
		const copy = new Uint8Array(new SharedArrayBuffer(length));
		copy.set(view.uint8.subarray(0, length));
		return copy;
	};
}
