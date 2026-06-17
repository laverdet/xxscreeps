import type { PluginItem } from '@babel/core';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hack in support for private class fields & methods
import AcornClassFields from 'acorn-class-fields';
import AcornPrivateMethods from 'acorn-private-methods';
import Webpack from 'webpack';

const Acorn = createRequire(import.meta.url)('acorn') as typeof import('acorn');
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
Acorn.Parser = Acorn.Parser.extend(AcornClassFields, AcornPrivateMethods);

type ExternalsFunctionElement = Parameters<typeof Webpack>[0][0]['externals'];
type ExternalsPromise = Extract<ExternalsFunctionElement, (...args: any) => Promise<any>>;
type ExternalsCallback = (...args: Parameters<ExternalsPromise>) =>
	ReturnType<ExternalsPromise> extends Promise<infer Result> ? Result | void | Promise<Result | void> : never;
export type Transform = {
	alias?: Record<string, false | string>;
	babel?: PluginItem[];
	externals?: ExternalsCallback;
	plugins?: Webpack.WebpackPluginInstance[];
};

function resolve(module: string) {
	return fileURLToPath(import.meta.resolve(module));
}

const IS_DEV = true as boolean;

export async function compile(moduleName: string, transform: Transform) {
	const baseName = Path.basename(moduleName);
	const output = new URL(`${baseName}.webpack.js`, import.meta.url);
	const babelLoader = resolve('babel-loader');
	const sourceMapLoader = resolve('source-map-loader');
	await new Promise<Webpack.StatsCompilation>((resolve, reject) => {
		Webpack({
			entry: {
				[`${baseName}.webpack`]: moduleName,
			},
			mode: IS_DEV ? 'development' : 'production',
			devtool: IS_DEV ? 'hidden-source-map' : 'hidden-nosources-source-map',
			externals(data, callback) {
				(async function() {
					const result = await transform.externals?.(data);
					if (result !== undefined) {
						return result;
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
						...(transform.babel?.length ?? 0) === 0 ? [] : [ {
							loader: babelLoader,
							options: {
								plugins: transform.babel,
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
					...transform.alias,
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
				// Global `process` is used by `node:path` which is used by `source-map-support`
				new Webpack.ProvidePlugin({
					process: 'process',
				}),
				// Webpack chokes on the `node:` scheme even with a resolution alias (except for externals)
				new Webpack.NormalModuleReplacementPlugin(/^node:.+/, resource => {
					resource.request = resource.request.replace(/^node:/, '');
				}),
				...transform.plugins ?? [],
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
