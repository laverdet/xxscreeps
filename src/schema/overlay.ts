import type { BufferView } from './buffer-view';
import type { Cache } from './cache';
import type { StructLayout } from './layout';
import { getBuffer, getOffset, BufferObject } from './buffer-object';
import { TypeOf, Variant } from './format';
import { makeTypeReader } from './read';
import { entriesWithSymbols } from './symbol';

const { defineProperty } = Object;
const { apply } = Reflect;

type GetterReader = (this: BufferObject) => any;

const injected = new WeakSet();
export function injectGetters(layout: StructLayout, prototype: object, cache: Cache) {
	// Hacky double-inject prevention
	if (injected.has(prototype)) {
		return;
	}
	injected.add(prototype);

	for (const [ key, member ] of entriesWithSymbols(layout.struct)) {
		const { layout, offset, pointer } = member;

		// Make getter
		const get = function(): GetterReader {

			// Get reader for this member
			const get = function(): GetterReader {
				const read = makeTypeReader(layout, cache);
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
					defineProperty(this, key, {
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
		Object.defineProperty(prototype, key, {
			get,
			set(value) {
				defineProperty(this, key, {
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

// Helper types for `withOverlay`
type AbstractBufferObjectSubclass<Instance extends BufferObject = any> =
	abstract new(view?: BufferView, offset?: number) => Instance;
type BufferObjectSubclass<Instance extends BufferObject> =
	new(view?: BufferView, offset?: number) => Instance;
type BufferObjectConstructor<
	Base extends AbstractBufferObjectSubclass,
	Instance extends BufferObject,
> = Omit<Base, 'prototype'> & (Base extends BufferObjectSubclass<any> ?
	BufferObjectSubclass<Instance> : AbstractBufferObjectSubclass<Instance>);

/**
 * Injects types inherited from format into class prototype. Just passes the base class back
 * unchanged in JS, this is only used for type information.
 * @param base Base class
 * @param type Schema format
 */
export function withOverlay<Base extends AbstractBufferObjectSubclass, Type>(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	base: Base, type: Type):
Base extends AbstractBufferObjectSubclass<infer Instance> ?
BufferObjectConstructor<Base, Instance & TypeOf<Type>> : never {
	return base as never;
}
