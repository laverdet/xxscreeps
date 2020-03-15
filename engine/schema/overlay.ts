import type { StructLayout } from './layout';
import { getBuffer, getOffset, BufferObject } from './buffer-object';
import { getReader, BoundReadInterceptorSchema } from './read';

const { defineProperty } = Object;
const { apply } = Reflect;

export function injectGetters(
	layout: StructLayout,
	prototype: object,
	interceptorSchema: BoundReadInterceptorSchema,
) {
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, memberLayout ] of Object.entries(layout.struct)) {
		const { layout, offset, pointer } = memberLayout;
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make getter
		let get: (this: BufferObject) => any = function() {
			const read = getReader(layout, interceptorSchema);
			if (pointer) {
				return function(this: BufferObject) {
					const buffer = getBuffer(this);
					const localOffset = getOffset(this);
					return read(buffer, offset + buffer.uint32[offset + localOffset]);
				};
			} else {
				return function(this: BufferObject) {
					return read(getBuffer(this), offset + getOffset(this));
				};
			}
		}();

		// Possible compose interceptor
		const composer = interceptors?.[key]?.compose;
		if (composer) {
			const prev = get;
			get = function() {
				const value = composer(apply(prev, this, []));
				defineProperty(this, symbol, {
					enumerable: true,
					value,
				});
				return value;
			};
		}

		// Define getter on proto
		Object.defineProperty(prototype, symbol, {
			enumerable: true,
			get,
			set: function(value) {
				defineProperty(this, symbol, {
					enumerable: true,
					value,
				});
			},
		});
	}
}
