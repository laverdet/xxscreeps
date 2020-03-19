import type { Format } from './format';
import type { Layout } from './layout';
export { BufferView } from './buffer-view';
export { getReader } from './read';
export { getWriter } from './write';

export type SchemaFormat = {
	[key: string]: Format;
};

export type Schema = {
	[key: string]: Layout;
};
