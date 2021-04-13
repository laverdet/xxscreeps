export { BufferView } from './buffer-view';
export { Format, TypeOf, array, compose, constant, declare, enumerated, optional, struct, variant, vector, withFallback, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

// This is defined here because otherwise tsc won't emit this module
import { XSymbol } from './symbol';
export { XSymbol };
export const Variant = XSymbol('schemaVariant');

import { Cache } from './cache';
import { Format } from './format';
import { makeReader } from './read';
import { makeWriter } from './write';
export function makeReaderAndWriter<Type extends Format>(format: Type) {
	const cache = new Cache;
	return {
		read: makeReader(format, cache),
		write: makeWriter(format, cache),
	};
}
