import { getBuffer, getOffset, BufferObject } from './buffer-object';
import type { BufferView } from './buffer-view';
import { Variant, TypeOf, WithType } from './format';
import type { InterceptorLookup } from './interceptor';
import type { StructLayout } from './layout';
import { getTypeReader } from './read';


const { defineProperty } = Object;
const { apply } = Reflect;

type GetterReader = (this: BufferObject) => any;

export function injectGetters(layout: StructLayout, prototype: object, lookup: InterceptorLookup) {
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const { layout, offset, pointer } = member;
		const symbol = lookup.symbol(layout) ?? key;

		// Make getter
		const get = function(): GetterReader {

			// Get reader for this member
			const get = function(): GetterReader {
				const read = getTypeReader(layout, lookup);
				if (pointer === true) {
					return function() {
						const buffer = getBuffer(this);
						const localOffset = getOffset(this);
						return read(buffer, buffer.uint32[(offset + localOffset) >>> 2]);
					};
				} else {
					return function() {
						return read(getBuffer(this), offset + getOffset(this));
					};
				}
			}();

			// Memoize everything except integer access
			if (!(
				layout === 'int8' || layout === 'int16' || layout === 'int32' ||
				layout === 'uint8' || layout === 'uint16' || layout === 'uint32' ||
				layout === 'bool'
			)) {
				return function() {
					const value = apply(get, this, []);
					defineProperty(this, symbol, {
						value,
						writable: true,
					});
					return value;
				};
			}

			// Getter w/ no memoization
			return get;
		}();

		// Define getter on proto
		Object.defineProperty(prototype, symbol, {
			get,
			set(value) {
				defineProperty(this, symbol, {
					enumerable: true,
					writable: true,
					value,
				});
			},
		});
	}

	// Add Variant key
	const variant = layout['variant!'];
	if (variant !== undefined) {
		Object.defineProperty(prototype, Variant, {
			value: variant,
		});
	}
}

// Injects types from format and interceptors into class prototype
export function withOverlay<Format extends WithType>() {
	return <Type extends { prototype: object }>(classDeclaration: Type) =>
		classDeclaration as any as new (view: BufferView, offset: number) =>
			Type['prototype'] & TypeOf<Format>;
}
