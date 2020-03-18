import type { Format } from './format';
import type { Layout } from './layout';

export type SchemaFormat = {
	[key: string]: Format;
};

export type Schema = {
	[key: string]: Layout;
};
