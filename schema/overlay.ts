import { Implementation } from 'xxscreeps/util/types';
import type { BufferView } from './buffer-view';
import type { StructLayout } from './layout';
import { getBuffer, getOffset, BufferObject } from './buffer-object';
import { TypeOf, Variant } from './format';
import { makeTypeReader } from './read';

const { defineProperty } = Object;
const { apply } = Reflect;

type GetterReader = (this: BufferObject) => any;

const injected = new WeakSet();
export function injectGetters(layout: StructLayout, prototype: object) {
	// Hacky double-inject prevention
	if (injected.has(prototype)) {
		return;
	}
	injected.add(prototype);

	for (const [ key, member ] of Object.entries(layout.struct)) {
		const { layout, name, offset, pointer } = member;
		const symbol = name ?? key;

		// Make getter
		const get = function(): GetterReader {

			// Get reader for this member
			const get = function(): GetterReader {
				const read = makeTypeReader(layout, 0 as any);
				if (pointer) {
					return function() {
						const buffer = getBuffer(this);
						return read(buffer, buffer.uint32[(offset + getOffset(this)) >>> 2]);
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
	const variant = layout.variant;
	if (variant !== undefined) {
		Object.defineProperty(prototype, Variant, {
			value: variant,
		});
	}
}

// Injects types from format and interceptors into class prototype
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function withOverlay<Type>(type?: Type) {
	return <Base extends Implementation>(classDeclaration: Base) =>
		classDeclaration as never as new (view: BufferView, offset: number) =>
			Base['prototype'] & TypeOf<Type> & { __withOverlay: true };
}
