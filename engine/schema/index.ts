export { BufferView } from './buffer-view';
export { makeArray, makeVariant, makeVector, withType, Format, Inherit, Variant } from './format';
export { Interceptor } from './interceptor';
export { getReader } from './read';
export { getWriter } from './write';

//export type Shape<Layout, Interceptors> = ReturnType<getReader<Layout, Interceptors>>;

// Exported for convenience
export { checkCast } from '~/lib/utility';
