import { promises as fs } from 'fs';
import * as Path from 'path';
import Webpack from 'webpack';

export type ExternalsFunctionElement =
	(
		request: { context: string; request: string },
		callback: (error?: Error | null, result?: string) => void,
	) => void;

export async function compile(moduleName: string, externals: ExternalsFunctionElement) {
	const baseName = Path.basename(moduleName);
	const output = Path.join(__dirname, `${baseName}.webpack.js`);
	await new Promise<Webpack.Stats.ToJsonOutput>((resolve, reject) => {
		Webpack({
			entry: {
				[`${baseName}.webpack`]: moduleName,
			},
			mode: 'development',
			devtool: 'inline-source-map',
			externals,

			resolve: {
				extensions: [ '.js', '.ts' ],
				alias: {
					'~': Path.join(__dirname, '..'),
					'path$': false as any,
				},
			},

			module: {
				rules: [ {
					test: /\.ts$/,
					loader: 'babel-loader',
					options: {
						cacheCompression: false,
						cacheDirectory: true,
						plugins: [
							'@babel/plugin-transform-typescript',
							// These are needed because Webpack parses the code again and it doesn't yet support
							// the features..
							'@babel/plugin-proposal-class-properties',
							'@babel/plugin-proposal-nullish-coalescing-operator',
							'@babel/plugin-proposal-optional-chaining',
						],
					},
				} ],
			},

			optimization: {
				concatenateModules: true,
			},

			output: {
				library: 'module',
				libraryTarget: 'var',
				path: __dirname,
				pathinfo: false,
			},
		}, (error, stats) => {
			if (error as unknown as boolean) {
				reject(error);
			} else {
				const info = stats.toJson();
				if (stats.hasErrors()) {
					reject((info.errors[0] as any).message);
				} else {
					if (stats.hasWarnings()) {
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
