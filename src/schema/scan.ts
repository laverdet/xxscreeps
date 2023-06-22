import type { Builder } from './index.js';
import type { Layout, StructLayout } from './layout.js';
import Fn from 'xxscreeps/utility/functional.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { Variant } from './format.js';
import { alignTo, kPointerSize, unpackWrappedStruct } from './layout.js';
import { entriesWithSymbols } from './symbol.js';

export type Scanner<Type = any> = (value: Type, heap: number) => number;

const empty: Scanner = (value, heap) => heap;

function makeMemberScanner(layout: StructLayout, builder: Builder): Scanner | undefined {
	return getOrSet(builder.scanner, layout, () => {

		let scanMembers: Scanner | undefined;
		for (const [ key, member ] of entriesWithSymbols(layout.struct)) {
			// Don't bother scanning union members
			if (member.union) {
				continue;
			}

			// Make scanner for single field
			const next = function(): Scanner | undefined {
				const { member: layout } = member;
				const scan = makeTypeScanner(layout, builder);
				if (scan) {
					Object.defineProperty(scan, 'name', {
						value: `${typeof key === 'symbol' ? key.description : key}`,
					});
				}
				return scan ? (value, heap) => scan(value[key], heap) : undefined;
			}();

			// Combine member writers
			if (next) {
				const prev = scanMembers;
				if (prev === undefined) {
					scanMembers = next;
				} else {
					scanMembers = (value, heap) => next(value, prev(value, heap));
				}
			}
		}

		// Run inheritance recursively
		const { inherit } = layout;
		if (inherit === undefined) {
			return scanMembers;
		} else {
			const scanBase = makeMemberScanner(unpackWrappedStruct(inherit), builder);
			if (scanBase) {
				return scanMembers ? (value, heap) => scanMembers!(value, scanBase(value, heap)) : scanBase;
			} else {
				return scanMembers;
			}
		}
	});
}

export function makeTypeScanner(layout: Layout, builder: Builder): Scanner | undefined {
	return getOrSet(builder.scanner, layout, () => {

		if (typeof layout === 'string') {
			// Basic types
			switch (layout) {
				default: return;

				case 'buffer': return (value: Uint8Array, heap) => heap + value.length;

				case 'string': return (value: string, heap) => {
					const string = `${value}`;
					const { length } = string;
					for (let ii = 0; ii < length; ++ii) {
						const code = string.charCodeAt(ii);
						if (code >= 0x100) {
							return alignTo(heap, 2) + length * 2;
						}
					}
					return heap + length;
				};
			}
		}

		if ('composed' in layout) {
			// Composed value
			const { composed, interceptor } = layout;
			const scan = makeTypeScanner(composed, builder);
			if (scan && 'decompose' in interceptor) {
				return (value, heap) => scan(interceptor.decompose(value), heap);
			} else {
				return scan;
			}

		} else if ('list' in layout) {
			// Vector with dynamic element size
			const { size, list: elementLayout } = layout;
			const align = Math.max(kPointerSize, layout.align);
			const scan = makeTypeScanner(elementLayout, builder)!;
			return (value, heap) => Fn.reduce(value, heap, (heap, element) =>
				scan(element, alignTo(heap + kPointerSize, align) + size));

		} else if ('named' in layout) {
			// Named type
			return makeTypeScanner(layout.layout, builder);

		} else if ('optional' in layout) {
			// Small optional element
			const { optional: elementLayout, uninitialized } = layout;
			const scan = makeTypeScanner(elementLayout, builder);
			if (scan) {
				return (value, heap) => value === uninitialized ? heap : scan(value, heap);
			}

		} else if ('pointer' in layout) {
			// Optional element implemented as pointer
			const { align, size, pointer: elementLayout, uninitialized } = layout;
			const scan = makeTypeScanner(elementLayout, builder) ?? empty;
			return (value, heap) => {
				if (value === uninitialized) {
					return heap;
				} else {
					const payloadOffset = alignTo(heap, align);
					return scan(value, payloadOffset + size);
				}
			};

		} else if ('struct' in layout) {
			// Structured types
			return makeMemberScanner(layout, builder);

		} else if ('variant' in layout) {
			// Variant types
			const variantMap = new Map(layout.variant.map((element): [ string | number, Scanner ] => {
				const { align, size } = element;
				const layout = unpackWrappedStruct(element.layout);
				const scan = makeTypeScanner(layout, builder) ?? empty;
				return [
					layout.variant!,
					(value, heap) => scan(value, alignTo(heap, align) + size),
				];
			}));
			return (value, heap) => variantMap.get(value[Variant])!(value, heap);

		} else if ('vector' in layout) {
			// Vector with fixed element size
			const { align, size, stride } = layout;
			const tailPadding = stride - size;
			return (value, heap) => {
				const { length } = value;
				if (length === 0) {
					return heap;
				} else if (length > 0) {
					return alignTo(heap, align) + value.length * stride - tailPadding;
				} else {
					const start = alignTo(heap, align);
					const end = Fn.reduce(value, start, value => value + stride);
					if (end === start) {
						return heap;
					} else {
						return end - tailPadding;
					}
				}
			};
		}
	});
}
