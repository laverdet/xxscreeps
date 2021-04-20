import { typedArrayToString } from 'xxscreeps/utility/string';
import { BufferView } from './buffer-view';
import { Cache, getOrSet } from './cache';
import { Format, TypeOf, Variant } from './format';
import { Layout, StructLayout, getLayout, kPointerSize, unpackWrappedStruct } from './layout';
import { entriesWithSymbols } from './symbol';

export type Reader<Type = any> = (view: Readonly<BufferView>, offset: number) => Type;
export type MemberReader = (value: any, view: Readonly<BufferView>, offset: number) => void;

function getMemberReader(layout: StructLayout, cache: Cache): MemberReader {
	return getOrSet(cache.memberReader, layout, () => {

		let readMembers: MemberReader | undefined;
		for (const [ key, member ] of entriesWithSymbols(layout.struct)) {

			// Make reader for single field
			const next = function(): MemberReader {
				const { member: layout, offset } = member;
				const read = makeTypeReader(layout, cache);

				// Wrap to read this field from reserved address
				return (value, view, instanceOffset) => {
					value[key] = read(view, instanceOffset + offset);
				};
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

				case 'buffer': return (view, offset) =>
					view.uint8.subarray(view.int32[offset >>> 2], view.int32[(offset >>> 2) + 1]);

				case 'string': return (view, offset) => {
					const stringOffset = view.int32[offset >>> 2];
					const length = view.int32[(offset >>> 2) + 1];
					if (length > 0) {
						return typedArrayToString(view.uint8.slice(stringOffset, stringOffset + length));
					} else if (length < 0) {
						const stringOffset16 = stringOffset >>> 1;
						return typedArrayToString(view.uint16.slice(stringOffset16, stringOffset16 - length));
					} else {
						return '';
					}
				};

				default: throw TypeError(`Invalid literal layout: ${layout}`);
			}
		}

		if ('array' in layout) {
			// Array with fixed element size
			const { length, stride } = layout;
			const elementLayout = layout.array;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				const value: any[] = [];
				let currentOffset = offset;
				for (let ii = 0; ii < length; ++ii) {
					value.push(read(view, currentOffset));
					currentOffset += stride;
				}
				return value;
			};

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

		} else if ('list' in layout) {
			// Vector with dynamic element size
			const elementLayout = layout.list;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				const value = [];
				let currentOffset = view.int32[offset >>> 2];
				while (currentOffset !== 0) {
					value.push(read(view, currentOffset));
					currentOffset = view.int32[currentOffset - kPointerSize >>> 2];
				}
				return value;
			};

		} else if ('named' in layout) {
			// Named type
			return makeTypeReader(layout.layout, cache);

		} else if ('optional' in layout) {
			// Small optional element
			const { size, optional: elementLayout } = layout;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				if (view.uint8[offset + size]) {
					return read(view, offset);
				} else {
					return undefined;
				}
			};

		} else if ('pointer' in layout) {
			// Optional element implemented as pointer
			const elementLayout = layout.pointer;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				const payloadOffset = view.int32[offset >>> 2];
				if (payloadOffset === 0) {
					return undefined;
				} else {
					return read(view, payloadOffset);
				}
			};

		} else if ('struct' in layout) {
			// Structured types
			const { variant } = layout;
			const readMembers = getMemberReader(layout, cache);
			if (variant) {
				return (view, offset) => {
					const value = { [Variant]: variant };
					readMembers(value, view, offset);
					return value;
				};
			} else {
				return (view, offset) => {
					const value = {};
					readMembers(value, view, offset);
					return value;
				};
			}

		} else if ('variant' in layout) {
			// Variant types
			const variantReaders = layout.variant.map(element =>
				makeTypeReader(element.layout, cache));
			if (variantReaders.length !== layout.variant.length) {
				throw new Error('Missing or duplicated variant key');
			}
			return (view, offset) => variantReaders[view.uint8[offset + kPointerSize]](view, view.int32[offset >>> 2]);

		} else if ('vector' in layout) {
			// Vector with fixed element size
			const { size, vector: elementLayout } = layout;
			const read = makeTypeReader(elementLayout, cache);
			return (view, offset) => {
				let currentOffset = view.int32[offset >>> 2];
				const length = view.int32[(offset >>> 2) + 1];
				const value: any[] = [];
				for (let ii = 0; ii < length; ++ii) {
					value.push(read(view, currentOffset));
					currentOffset += size;
				}
				return value;
			};
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
