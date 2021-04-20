import type { Transform } from 'xxscreeps/driver/webpack';
import type { Format } from 'xxscreeps/schema';
import { Package, build as buildSchema } from 'xxscreeps/schema/build';
import { getName } from 'xxscreeps/schema/format';
import config, { configPath } from 'xxscreeps/config';

const archivePath = new URL(`${config.schemaArchive}/`, configPath);

const packages = new Map<string, Package>();
export function build<Type extends Format>(format: Type, cache = new Map) {
	const name = getName(format);
	if (name === null) {
		throw new Error('`build` requires named schema');
	}
	const result = buildSchema(format, archivePath, cache);
	packages.set(name, result);
	return result;
}

export const schemaTransform: Transform = {
	alias: {
		'xxscreeps/engine/schema/build': 'xxscreeps/engine/schema/build/runtime',
	},
	externals: ({ request }) => {
		if (request === 'xxscreeps/engine/schema/build/packages') {
			return JSON.stringify(Object.fromEntries([ ...packages ].map(entry => [ entry[0], {
				version: entry[1].version,
			} ])));
		}
	},
};
