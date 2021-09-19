import type { PluginItem } from '@babel/core';
import fs from 'fs/promises';
import Fn from 'xxscreeps/utility/functional';
import Webpack from 'webpack';
import * as Path from 'path';
import { fileURLToPath } from 'url';

// Hack in support for private class fields & methods
import { createRequire } from 'module';
import AcornClassFields from 'acorn-class-fields';
import AcornPrivateMethods from 'acorn-private-methods';
const Acorn = createRequire(import.meta.url)('acorn');
Acorn.Parser = Acorn.Parser.extend(AcornClassFields, AcornPrivateMethods);

type ExternalsFunctionElement = Parameters<typeof Webpack>[0][0]['externals'];
type ExternalsPromise = Extract<ExternalsFunctionElement, (...args: any) => Promise<any>>;
type ExternalsCallback = (...args: Parameters<ExternalsPromise>) =>
	ReturnType<ExternalsPromise> extends Promise<infer Result> ? Result | void | Promise<Result | void> : never;
export type Transform = {
	alias?: Record<string, false | string>;
	babel?: PluginItem;
	externals?: ExternalsCallback;
};

async function resolve(module: string) {
	return fileURLToPath(await import.meta.resolve!(module));
}

const IS_DEV = true as boolean;

export async function compile(moduleName: string, transforms: Transform[]) {
	const baseName = Path.basename(moduleName);
	const output = new URL(`${baseName}.webpack.js`, import.meta.url);
	const babelPlugins = [ ...Fn.filter(Fn.map(transforms, transform => transform.babel)) ];
	const babelLoader = await resolve('babel-loader');
	const sourceMapLoader = await resolve('source-map-loader');
	await new Promise<Webpack.StatsCompilation>((resolve, reject) => {
		Webpack({
			entry: {
				[`${baseName}.webpack`]: moduleName,
			},
			mode: IS_DEV ? 'development' : 'production',
			devtool: IS_DEV ? 'hidden-source-map' : 'hidden-nosources-source-map',
			externals(data, callback) {
				(async function() {
					for (const transform of transforms) {
						const result = await transform.externals?.(data);
						if (result) {
							return result;
						}
					}
				})().then(value => callback(undefined, value), callback);
			},

			module: {
				rules: [ {
					test: /\.m?jsx?$/,
					exclude: {
						and: [
							/\/node_modules\//,
							{ not: /\/node_modules\/xxscreeps\/dist\// },
						],
					},
					type: 'javascript/esm',
					resolve: { fullySpecified: false },
					use: [
						...babelPlugins.length === 0 ? [] : [ {
							loader: babelLoader,
							options: {
								cacheCompression: false,
								cacheDirectory: fileURLToPath(new URL('.cache', import.meta.url)),
								plugins: babelPlugins,
							},
						} ],
						sourceMapLoader,
					],
				} ],
			},

			resolve: {
				alias: {
					'buffer-from': false,
					fs: false,
					path: 'path-browserify',
					...Object.fromEntries(transforms.map(transform => Object.entries(transform.alias ?? {})).flat()),
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
					module: '{require:()=>({})}',
					processInfo: `({
						arch: ${JSON.stringify(process.arch)},
						platform: ${JSON.stringify(process.platform)},
						version: ${JSON.stringify(process.version)},
					})`,
				}),
				new Webpack.ProvidePlugin({
					process: 'process',
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
