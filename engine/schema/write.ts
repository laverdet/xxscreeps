import type { BufferView } from './buffer-view';
import { Variant } from './format';
import type { BoundInterceptorSchema } from './interceptor';
import { kPointerSize, alignTo, getTraits, Layout, StructLayout } from './layout';
import { RecursiveWeakMemoize } from '~/lib/memoize';

type Writer<Type = any> = (value: Type, view: BufferView, offset: number) => number;
type MemberWriter = (value: any, view: BufferView, offset: number, locals: number) => number;

const getMemberWriter = RecursiveWeakMemoize([ 0, 1 ],
	(layout: StructLayout, interceptorSchema: BoundInterceptorSchema): MemberWriter => {

		let memberWriter: MemberWriter | undefined;
		const interceptors = interceptorSchema.get(layout);
		for (const [ key, member ] of Object.entries(layout.struct)) {
			const symbol = interceptors?.members?.[key]?.symbol ?? key;

			// Make writer for single field. `locals` parameter is offset to dynamic memory.
			const next = function(): MemberWriter {
			// Get writer for this member
				const { offset, pointer } = member;
				const write = function(): Writer {
					const write = getWriter(member.layout, interceptorSchema);

					// Has decomposer?
					const decompose = interceptors?.members?.[key]?.decompose;
					if (decompose !== undefined) {
						return (value, view, offset) => write(decompose(value), view, offset);
					}
					const decomposeIntoBuffer = interceptors?.members?.[key]?.decomposeIntoBuffer;
					if (decomposeIntoBuffer !== undefined) {
						if (pointer === true) {
							throw new Error('Pointer to raw decomposer is not supported');
						}
						return (value, view, offset) => decomposeIntoBuffer(value, view, offset);
					}

					// Plain writer
					return write;
				}();

				// Wrap to write this field at reserved address
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
	(layout: Layout, interceptorSchema: BoundInterceptorSchema): Writer => {

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

		} else if ('variant' in layout) {
		// Variant types
			const variantMap = new Map<string, Writer>();
			for (let ii = 0; ii < layout.variant.length; ++ii) {
				const elementLayout = layout.variant[ii];
				const write = getWriter(elementLayout, interceptorSchema);
				variantMap.set(
				elementLayout[Variant]!,
				(value, view, offset) => {
					view.uint32[offset >>> 2] = ii;
					return kPointerSize + write(value, view, offset + kPointerSize);
				},
				);
			}
			return (value, view, offset) => variantMap.get(value[Variant])!(value, view, offset);

		} else if ('vector' in layout) {
			const elementLayout = layout.vector;
			const write = getWriter(elementLayout, interceptorSchema);
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
			const write = function(): Writer {
				const { inherit } = layout;
				const write = getMemberWriter(layout, interceptorSchema);
				if (inherit === undefined) {
					return (value, view, offset) => write(value, view, offset, offset + size) - offset;
				} else {
					const writeBase = getMemberWriter(inherit, interceptorSchema);
					return (value, view, offset) =>
						write(value, view, offset, writeBase(value, view, offset, offset + size)) - offset;
				}
			}();

			// Has composer?
			const interceptors = interceptorSchema.get(layout);
			const decompose = interceptors?.decompose;
			if (decompose !== undefined) {
				return (value, view, offset) => write(decompose(value), view, offset);
			}
			const decomposeIntoBuffer = interceptors?.decomposeIntoBuffer;
			if (decomposeIntoBuffer !== undefined) {
				return (value, view, offset) => decomposeIntoBuffer(value, view, offset);
			}
			return write;
		}
	});

/*export function getWriter<Type extends Layout>(
	layout: Type, interceptorSchema: BoundWriteInterceptorSchema
): Writer<Shape<Type>>;*/
export function getWriter(layout: Layout, interceptorSchema: BoundInterceptorSchema) {
	return memoizeGetWriter(layout, interceptorSchema);
}
