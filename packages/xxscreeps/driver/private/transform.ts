import type { TransformOptions } from '@babel/core';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { transformSync } from '@babel/core';
import convertSourceMap from 'convert-source-map';
import Privates from 'xxscreeps/driver/private/plugin.js';

/** @internal */
export async function privateTransformLoader(url: string) {
	// Load file & source map
	const [ sourceText, sourceMap ] = await Promise.all([
		fs.readFile(new URL(url), 'utf8'),
		async function() {
			// 'xxscreeps/config/mods.static/game.js' has no map
			try {
				const source = await fs.readFile(new URL(`${url}.map`), 'utf8');
				return JSON.parse(source) as TransformOptions['inputSourceMap'];
			} catch {}
		}(),
	]);

	// Parse, transform & generate
	const result = function() {
		try {
			const result = transformSync(sourceText, {
				babelrc: false,
				configFile: false,
				filename: url,
				inputSourceMap: sourceMap,
				plugins: [ Privates ],
				retainLines: true,
				sourceMaps: true,
				sourceType: 'module',
			});
			assert.ok(result);
			return result;
		} finally {
			// nb: Babel has uncharacteristically poor hygiene here and assigns `Error.prepareStackTrace`
			// when you invoke `parse` and doesn't even bother to put it back. This causes nodejs's source
			// map feature to bail out and show plain source files.
			// https://github.com/babel/babel/blob/74b5ac21d0fb516ecc8d8375cc75b4446b6c9735/packages/babel-core/src/errors/rewrite-stack-trace.ts#L140
			// @ts-expect-error
			delete Error.prepareStackTrace;
		}
	}();

	// Build final module source
	assert.ok(result.code != null);
	assert.ok(result.map);
	const lastLine = result.code.lastIndexOf('\n');
	assert.ok(lastLine !== -1);
	const plainSourceText = result.code.slice(0, lastLine + 1) + convertSourceMap.removeMapFileComments(result.code.slice(lastLine + 1));
	const sourceMapComment = convertSourceMap.fromObject(result.map).toComment();
	// TODO: I'm not sure source maps are actually working. Line numbers look correct, but I
	// think that's from the `retainLines` option above. Additionally, it would be nice to
	// split source map blobs from the source text to keep this out of the main source text.
	return `${plainSourceText}\n${sourceMapComment}\n`;
}
