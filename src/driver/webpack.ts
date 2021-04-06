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

const IS_DEV = true as boolean;

export async function compile(moduleName: string, externals: ExternalsFunctionElement) {
	const baseName = Path.basename(moduleName);
	const output = new URL(`${baseName}.webpack.js`, import.meta.url);

	const sourceMapLoader = fileURLToPath(await import.meta.resolve('source-map-loader'));
	await new Promise<Webpack.StatsCompilation>((resolve, reject) => {
		Webpack({
			entry: {
				[`${baseName}.webpack`]: moduleName,
			},
			mode: IS_DEV ? 'development' : 'production',
			devtool: IS_DEV ? 'hidden-source-map' : 'hidden-nosources-source-map',
			externals,

			module: {
				rules: [ {
					test: /\.[cm]?jsx?$/,
					resolve: { fullySpecified: false },
					use: [ sourceMapLoader ],
				} ],
			},

			resolve: {
				alias: {
					'xxscreeps/config/mods/import': 'xxscreeps/config/mods.resolved',
					'xxscreeps/config/mods': false,
					'buffer-from': false,
					fs: false,
					path: 'path-browserify',
				},
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

			plugins: [
				new Webpack.DefinePlugin({
					'module': '{require:()=>({})}',
					'process': '({cwd:()=>".",version:""})',
				}),
			],

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

	// Grab Webpack'd data from file system
	const [ source, map ] = await Promise.all([
		fs.readFile(output, 'utf8'),
		fs.readFile(new URL(`${baseName}.webpack.js.map`, output), 'utf8'),
	]);
	return { source, map };
}
