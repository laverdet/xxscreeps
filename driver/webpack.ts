import { promises as fs } from 'fs';
import * as Path from 'path';
import { fileURLToPath } from 'url';
import Webpack from 'webpack';

// Hack in support for private class fields
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Acorn = require('acorn');
import AcornClassFields from 'acorn-class-fields';
Acorn.Parser = Acorn.Parser.extend(AcornClassFields);

export type ExternalsFunctionElement = Parameters<typeof Webpack>[0][0]['externals'];

export async function compile(moduleName: string, externals: ExternalsFunctionElement) {
	const baseName = Path.basename(moduleName);
	const output = new URL(`${baseName}.webpack.js`, import.meta.url);

	await new Promise<Webpack.StatsCompilation>((resolve, reject) => {
		Webpack({
			entry: {
				[`${baseName}.webpack`]: moduleName,
			},
			mode: 'development',
			devtool: 'inline-source-map',
			externals,

			module: {
				rules: [ {
					test: /\.[cm]?jsx?$/,
					resolve: { fullySpecified: false },
				} ],
			},

			optimization: {
				concatenateModules: true,
			},

			output: {
				iife: false,
				library: 'module',
				libraryTarget: 'var',
				path: fileURLToPath(new URL('.', import.meta.url)),
				pathinfo: false,
			},
		}, (error, stats) => {
			if (error) {
				reject(error);
			} else {
				const info = stats!.toJson();
				if (stats!.hasErrors()) {
					reject((info.errors![0] as any).message);
				} else {
					if (stats!.hasWarnings()) {
						console.log(info.warnings);
					}
					resolve(info);
				}
			}
		});
	});

	// Grab Webpack'd data from file system and delete the output
	const source = await fs.readFile(output, 'utf8');
	return source;
}
