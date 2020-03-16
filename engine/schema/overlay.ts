import type { StructLayout } from './layout';
import { getBuffer, getOffset, BufferObject } from './buffer-object';
import { getSingleMemberReader, BoundReadInterceptorSchema } from './read';

const { defineProperty } = Object;
const { apply } = Reflect;

type GetterReader = (this: BufferObject) => any;

export function injectGetters(
	layout: StructLayout,
	prototype: object,
	interceptorSchema: BoundReadInterceptorSchema,
) {
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const { layout, offset, pointer } = member;
		const symbol = interceptors?.[key]?.symbol ?? key;

		// Make getter
		const get = function(): GetterReader {

			// Get reader for this member
			const get = function(): GetterReader {
				const read = getSingleMemberReader(key, layout, interceptors, interceptorSchema);
				if (pointer === true) {
					return function() {
						const buffer = getBuffer(this);
						const localOffset = getOffset(this);
						return read(buffer, offset + buffer.uint32[offset + localOffset]);
					};
				} else {
					return function() {
						return read(getBuffer(this), offset + getOffset(this));
					};
				}
			}();

			// Memoize?
			if (
				layout === 'string' ||
				interceptors?.[key]?.compose !== undefined ||
				interceptors?.[key]?.composeFromBuffer !== undefined
			) {
				return function() {
					const value = apply(get, this, []);
					defineProperty(this, symbol, { value });
					return value;
				};
			}

			// Getter w/ no memoization
			return get;
		}();

		// Define getter on proto
		Object.defineProperty(prototype, symbol, {
			enumerable: true,
			get,
			set(value) {
				defineProperty(this, symbol, {
					enumerable: true,
					value,
				});
			},
		});
	}
}
