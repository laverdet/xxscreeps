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

	// Check for interceptors that don't match the layout
	if (interceptors?.members) {
		for (const key of Object.keys(interceptors.members)) {
			if (!(key in layout.struct)) {
				throw new Error(`Interceptor found for ${key} but does not exist in layout`);
			}
		}
	}

	// Add Variant key
	const variant = layout[Variant];
	if (variant !== undefined) {
		Object.defineProperty(prototype, Variant, {
			value: variant,
		});
	}
}
