import { typedArrayToString } from 'xxscreeps/utility/string';
import { BufferView } from './buffer-view';
import { Cache, getOrSet } from './cache';
import { Format, TypeOf, Variant } from './format';
import { Layout, StructLayout, getLayout, kPointerSize, unpackWrappedStruct, alignTo } from './layout';
import { entriesWithSymbols } from './symbol';

export type Reader<Type = any> = (view: Readonly<BufferView>, offset: number) => Type;
export type MemberReader = (value: any, view: Readonly<BufferView>, offset: number) => void;

function getMemberReader(layout: StructLayout, cache: Cache): MemberReader {
	return getOrSet(cache.memberReader, layout, () => {

		let readMembers: MemberReader | undefined;
		for (const [ key, member ] of entriesWithSymbols(layout.struct)) {

			// Make reader for single field
			const next = function(): MemberReader {
				const { layout, offset, pointer } = member;
				const read = makeTypeReader(layout, cache);

				// Wrap to read this field from reserved address
				if (pointer) {
					return (value, view, instanceOffset) => {
						const addr = view.uint32[instanceOffset + offset >>> 2];
						value[key] = read(view, addr);
					};
				} else {
					return (value, view, instanceOffset) => {
						value[key] = read(view, instanceOffset + offset);
					};
				}
			}();
			next.displayName = `_${typeof key === 'symbol' ? key.description : key}`;

			// Combine member readers
			const prev = readMembers;
			if (prev === undefined) {
				readMembers = next;
			} else {
				readMembers = (value, view, offset) => {
					next(value, view, offset);
					prev(value, view, offset);
				};
			}
		}

		// Run inheritance recursively
		const { inherit } = layout;
		if (inherit === undefined) {
			return readMembers!;
		} else {
			const readBase = getMemberReader(unpackWrappedStruct(inherit), cache);
			return (value, view, offset) => {
				readBase(value, view, offset);
				readMembers!(value, view, offset);
			};
		}
	});
}

export function makeTypeReader(layout: Layout, cache: Cache): Reader {
	return getOrSet(cache.reader, layout, () => {

		if (typeof layout === 'string') {
			// Basic types
			switch (layout) {
				case 'int8': return (view, offset) => view.int8[offset];
				case 'int16': return (view, offset) => view.int16[offset >>> 1];
				case 'int32': return (view, offset) => view.int32[offset >>> 2];

				case 'uint8': return (view, offset) => view.uint8[offset];
				case 'uint16': return (view, offset) => view.uint16[offset >>> 1];
				case 'uint32': return (view, offset) => view.uint32[offset >>> 2];

				case 'double': return (view, offset) => view.double[offset >>> 3];

				case 'bool': return (view, offset) => view.int8[offset] !== 0;

				case 'buffer': return (view, offset) => {
					const length = view.int32[offset >>> 2];
					return view.uint8.subarray(offset + kPointerSize, length);
				};

				case 'string': return (view, offset) => {
					const length = view.int32[offset >>> 2];
					if (length > 0) {
						const stringOffset = offset + kPointerSize;
						return typedArrayToString(view.uint8.slice(stringOffset, stringOffset + length));
					} else if (length < 0) {
						const stringOffset16 = offset + kPointerSize >>> 1;
						return typedArrayToString(view.uint16.slice(stringOffset16, stringOffset16 - length));
					} else {
						return '';
					}
				};

				default: throw TypeError(`Invalid literal layout: ${layout}`);
			}
		}

		if ('array' in layout) {
			// Array types
			const { length, stride } = layout;
			const elementLayout = layout.array;
			const read = makeTypeReader(elementLayout, cache);
			if (stride === undefined) {
				throw new TypeError('Unimplemented');

			} else {
				// Array with fixed element size
				return (view, offset) => {
					const value: any[] = [];
					let currentOffset = offset;
					for (let ii = 0; ii < length; ++ii) {
						value.push(read(view, currentOffset));
						currentOffset += stride;
					}
					return value;
				};
			}

		} else if ('constant' in layout) {
			const { constant } = layout;
			return () => constant;

		} else if ('composed' in layout) {
			// Composed value
			const { composed, interceptor } = layout;
			const read = makeTypeReader(composed, cache);
			if ('compose' in interceptor) {
				return (view, offset) => interceptor.compose(read(view, offset));
			} else if ('composeFromBuffer' in interceptor) {
				return (view, offset) => interceptor.composeFromBuffer(view, offset);
			} else {
				return (view, offset) => new (interceptor as any)(view, offset);
			}

		} else if ('enum' in layout) {
			// Enumerated types
			const { enum: values } = layout;
			return (view, offset) => values[view.uint8[offset]];

		} else if ('named' in layout) {
			// Named type
			return makeTypeReader(layout.layout, cache);

		} else if ('optional' in layout) {
			// Optional types
			const elementLayout = layout.optional;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				const relativeOffset = view.uint8[offset];
				if (relativeOffset === 0) {
					return undefined;
				} else {
					return read(view, offset + relativeOffset);
				}
			};

		} else if ('struct' in layout) {
			// Structured types
			const { variant } = layout;
			const readMembers = getMemberReader(layout, cache);
			return (view, offset) => {
				const value = variant ? { [Variant]: variant } : {};
				readMembers(value, view, offset);
				return value;
			};

		} else if ('variant' in layout) {
			// Variant types
			const variantReaders = layout.variant.map(elementLayout =>
				makeTypeReader(elementLayout.struct, cache));
			if (variantReaders.length !== layout.variant.length) {
				throw new Error('Missing or duplicated variant key');
			}
			return (view, offset) => variantReaders[view.uint32[offset >>> 2]](view, view.uint32[offset + kPointerSize >>> 2]);

		} else if ('vector' in layout) {
			const elementLayout = layout.vector;
			const read = makeTypeReader(elementLayout, cache);
			const { align, stride } = layout;

			if (stride === undefined) {
				// Vector with dynamic element size
				return (view, offset) => {
					const value = [];
					let currentOffset = view.uint32[offset >>> 2];
					while (currentOffset !== 0) {
						value.push(read(view, currentOffset));
						currentOffset = view.uint32[currentOffset - kPointerSize >>> 2];
					}
					return value;
				};

			} else {
				// Vector with fixed element size
				const alignOffset = alignTo(kPointerSize, align);
				return (view, offset) => {
					const length = view.uint32[offset >>> 2];
					if (length === 0) {
						return [];
					} else {
						const value: any[] = [];
						let currentOffset = offset + alignOffset;
						for (let ii = 0; ii < length; ++ii) {
							value.push(read(view, currentOffset));
							currentOffset += stride;
						}
						return value;
					}
				};
			}
		}

		throw new Error('Unknown layout');
	});
}

export function makeReader<Type extends Format>(format: Type, cache = new Cache) {
	const { layout } = getLayout(format, cache);
	const read = makeTypeReader(layout, cache);
	return (buffer: Readonly<Uint8Array>): TypeOf<Type> => {
		const view = BufferView.fromTypedArray(buffer);
		return read(view, 0);
	};
}
