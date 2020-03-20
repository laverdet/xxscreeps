import { getBuffer, getOffset, BufferObject } from './buffer-object';
import { Variant } from './format';
import type { BoundInterceptorSchema } from './interceptor';
import type { StructLayout } from './layout';
import { getSingleMemberReader } from './read';

const { defineProperty } = Object;
const { apply } = Reflect;

type GetterReader = (this: BufferObject) => any;

export function injectGetters(
	layout: StructLayout,
	prototype: object,
	interceptorSchema: BoundInterceptorSchema,
) {
	const interceptors = interceptorSchema.get(layout);
	for (const [ key, member ] of Object.entries(layout.struct)) {
		const { layout, offset, pointer } = member;
		const memberInterceptors = interceptors?.members?.[key];
		const symbol = memberInterceptors?.symbol ?? key;

		// Make getter
		const get = function(): GetterReader {

			// Get reader for this member
			const get = function(): GetterReader {
				const read = getSingleMemberReader(layout, interceptorSchema, memberInterceptors);
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

			// Memoize?
			if (
				layout === 'string' ||
				interceptors?.members?.[key]?.compose !== undefined ||
				interceptors?.members?.[key]?.composeFromBuffer !== undefined
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

	// Add Variant key
	const variant = layout[Variant];
	if (variant !== undefined) {
		Object.defineProperty(prototype, Variant, {
			value: variant,
		});
	}
}
