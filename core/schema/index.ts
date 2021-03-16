export { BufferView } from './buffer-view';
export { Format, TypeOf, array, compose, constant, declare, enumerated, member, optional, struct, variant, vector, withFallback, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

// This is defined here because otherwise tsc won't emit this module
import { XSymbol } from './symbol';
export { XSymbol };
export const Variant = XSymbol('schemaVariant');
