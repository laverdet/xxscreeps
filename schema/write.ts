import { BufferView } from './buffer-view';
import { Format, TypeOf, Variant } from './format';
import { Layout, StructLayout, kPointerSize, alignTo, getLayout, unpackWrappedStruct } from './layout';
import { runOnce } from 'xxscreeps/util/memoize';

type Writer<Type = any> = (value: Type, view: BufferView, offset: number) => number;
type MemberWriter = (value: any, view: BufferView, offset: number, locals: number) => number;

function makeMemberWriter(layout: StructLayout, lookup: any): MemberWriter {

	let writeMembers: MemberWriter | undefined;
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const symbol = member.name ?? key;

		// Make writer for single field. `locals` parameter is offset to dynamic memory.
		const next = function(): MemberWriter {
			const { align, layout, offset, pointer } = member;
			const write = makeTypeWriter(layout, lookup);

			// Wrap to write this field at reserved address
			if (pointer) {
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
		const writeBase = makeMemberWriter(unpackWrappedStruct(inherit), lookup);
		return (value, view, offset, locals) =>
			writeMembers!(value, view, offset, writeBase(value, view, offset, locals));
	}
}

function makeTypeWriter(layout: Layout, lookup: any): Writer {

	if (typeof layout === 'string') {
		// Basic types
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

	if ('array' in layout) {
		// Array types
		const { length, size, stride } = layout;
		const elementLayout = layout.array;
		const write = makeTypeWriter(elementLayout, lookup);
		if (stride === undefined) {
			throw new TypeError('Unimplemented');

		} else {
			// Array with fixed element size
			return (value, view, offset) => {
				let currentOffset = offset;
				for (let ii = 0; ii < length; ++ii) {
					write(value[ii], view, currentOffset);
					currentOffset += stride;
				}
				return size;
			};
		}

	} else if ('composed' in layout) {
		// Composed value
		const { composed, interceptor } = layout;
		const write = makeTypeWriter(composed, lookup);
		if ('decompose' in interceptor) {
			return (value, view, offset) => write(interceptor.decompose(value), view, offset);
		} else if ('decomposeIntoBuffer' in interceptor) {
			return (value, view, offset) => interceptor.decomposeIntoBuffer(value, view, offset);
		} else {
			return write;
		}

	} else if ('constant' in layout) {
		return () => 0;

	} else if ('enum' in layout) {
		// Enumerated types
		const enumMap = new Map(layout.enum.map((value, ii) => [ value, ii ]));
		return (value, view, offset) => ((view.uint8[offset] = enumMap.get(value)!, 1));

	} else if ('named' in layout) {
		// Named type
		return makeTypeWriter(layout.layout, lookup);

	} else if ('optional' in layout) {
		// Optional types
		const { align, optional: elementLayout } = layout;
		const write = makeTypeWriter(elementLayout, lookup);
		return (value, view, offset) => {
			if (value === undefined) {
				view.int8[offset] = 0;
				return kPointerSize;
			} else {
				const payloadOffset = alignTo(offset + 1, align);
				const relativeOffset = payloadOffset - offset;
				view.int8[offset] = relativeOffset;
				return write(value, view, payloadOffset) + relativeOffset;
			}
		};

	} else if ('struct' in layout) {
		// Structured types
		const { size } = layout;
		const writeMembers = makeMemberWriter(layout, lookup);
		return (value, view, offset) => writeMembers(value, view, offset, offset + size) - offset;

	} else if ('variant' in layout) {
		// Variant types
		const variantMap = new Map(layout.variant.map((unresolvedElement, ii): [ string | number, Writer ] => {
			const element = unpackWrappedStruct(unresolvedElement);
			const write = makeTypeWriter(element, lookup);
			return [
				element.variant!,
				(value, view, offset) => {
					view.uint32[offset >>> 2] = ii;
					return write(value, view, offset + kPointerSize) + kPointerSize;
				},
			];
		}));
		return (value, view, offset) => variantMap.get(value[Variant])!(value, view, offset);

	} else if ('vector' in layout) {
		const { size, stride, vector: elementLayout } = layout;
		const write = makeTypeWriter(elementLayout, lookup);
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
	}

	throw new Error('Unknown layout');
}

const bufferCache = runOnce(() => BufferView.fromTypedArray(new Uint8Array(1024 * 1024 * 16)));

export function makeWriter<Type extends Format>(format: Type, lookup = {}) {
	const { layout } = getLayout(format);
	const write = makeTypeWriter(layout, lookup);
	return (value: TypeOf<Type>): Readonly<Uint8Array> => {
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
