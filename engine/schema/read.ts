import { kPointerSize, alignTo, getTraits, Layout, Shape, StructLayout } from './layout';
import type { BufferView } from './buffer-view';

function getMemberReader(layout: StructLayout):
		(value: Record<string, any>, view: BufferView, offset: number) => void {
	let memberReader: ReturnType<typeof getMemberReader> | undefined;
	const members = Object.entries(layout.struct);
	members.forEach(([ key, member ]) => {
		// Make reader for single field
		const next = function(): NonNullable<typeof memberReader> {
			const read = getReader(member.layout);
			const { offset, pointer } = member;
			if (pointer) {
				return (value, view, instanceOffset) => {
					const addr = view.uint32[(offset + instanceOffset) >>> 2];
					value[key] = read(view, offset + addr);
				};
			} else {
				return (value, view, instanceOffset) => {
					value[key] = read(view, offset);
				}
			}
		}();
		// Combine member readers
		const prev = memberReader;
		if (prev) {
			memberReader = (value, view, offset) => {
				prev(value, view, offset);
				next(value, view, offset);
			};
		} else {
			memberReader = next;
		}
	});
	return memberReader!;
}

export function getReader<Type extends Layout>(layout: Type):
		(view: BufferView, offset: number) => Shape<Type>;
export function getReader(layout: Layout):
		(view: BufferView, offset: number) => any {

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
		const read = getReader(elementLayout);
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
		const read = getReader(elementLayout);
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
		const read = getMemberReader(layout);
		if (layout.inherit) {
			const readBase = getMemberReader(layout.inherit);
			return (view, offset) => {
				const value = {};
				readBase(value, view, offset);
				read(value, view, offset);
				return value;
			};
		} else {
			return (view, offset) => {
				const value = {};
				read(value, view, offset);
				return value;
			};
		}
	}
}
