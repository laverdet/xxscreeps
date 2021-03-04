export { BufferView } from './buffer-view';
export { Format, TypeOf, Variant, array, compose, constant, declare, enumerated, member, optional, struct, variant, vector, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

import type { Format } from './format';
import { makeReader } from './read';
export function resolveSchema(format: Format) {
	makeReader(format, 0);
}
