/* eslint-disable prefer-named-capture-group */
import 'xxscreeps/engine/room';
import * as C from 'xxscreeps/game/constants';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { mods } from 'xxscreeps/config/mods';
import { globalNames } from 'xxscreeps/game/runtime';

// Write tsconfig
const rootDir = fileURLToPath(new URL('../../src', import.meta.url));
const tsconfig = `{
	"extends": "xxscreeps/tsconfig.base",
	"compilerOptions": {
		"baseUrl": ${JSON.stringify(rootDir)},
		"declaration": true,
		"declarationMap": true,
		"emitDeclarationOnly": true,
		"noEmitOnError": false,
		"moduleResolution": "node",
		"module": "system",
		"outDir": null,
		"outFile": "screeps.exports.js",
		"resolveJsonModule": false,
		"rootDir": ${JSON.stringify(rootDir)},
		"strict": false,
	},
	"include": [ "backend", "config", "driver", "engine", "game", "processor", "schema", "storage", "utility", ${Object.keys(mods).map(url =>
		JSON.stringify(fileURLToPath(new URL('.', url)).replace(/.+\/xxscreeps\/dist\/mods/, 'mods'))).join(', ')} ],
}`;
const tmpPath = `${rootDir}/tsconfig.types.json`;
await fs.writeFile(tmpPath, tsconfig, { encoding: 'utf8', flag: 'w' });

// Run `tsc`
console.log(tsconfig);
try {
	const proc = spawn('npx', [ 'tsc', '-p', tmpPath ], { cwd: rootDir, stdio: 'inherit' });
	await new Promise<void>(resolve => {
		proc.once('exit', () => resolve());
	});
} finally {
	await fs.unlink(tmpPath);
}

async function readAndUnlink(file: string) {
	const result = await fs.readFile(file, 'utf8');
	await fs.unlink(file);
	return result;
}

// Read, fix, and move result
const dts = await readAndUnlink(`${rootDir}/screeps.exports.d.ts`);
const dtsMap = await readAndUnlink(`${rootDir}/screeps.exports.d.ts.map`);
await fs.mkdir('screeps/types', { recursive: true });
await fs.writeFile('screeps/types/screeps.exports.d.ts',
	dts
		// Fix module path names
		.replace(/(from|import|module) "/g, '$1 "xxscreeps/')
		.replace(/(from|import|module) "xxscreeps\/xxscreeps/g, '$1 "xxscreeps')
		// Fix import "foo/index" emit issue
		.replace(/\/index"/g, '"')
		// Remove <reference />
		.replace(/^\/\/\/ <reference.+/gm, '')
		// Break up file by block comments
		.split(/(\/\*[^]*?\*\/)/g)
		.map((val, ii) => {
			if (ii % 2) {
				return val;
			} else {
				// Insert @ts-ignore comments on every line (!)
				return val.replace(/\n/g, '// @ts-ignore\n');
			}
		}).join(''),
	'utf8');
await fs.writeFile('screeps/types/screeps.exports.d.ts.map', dtsMap);

// Write ambient globals file
await fs.writeFile('screeps/types/globals.d.ts',
	'type TypeFor<T> = T extends abstract new (...args: any) => infer R ? R : T;\n' +
	Object.keys(C).map(name =>
		`declare const ${name}: typeof import('xxscreeps/game/constants')['${name}'];\n`).join('') +
	globalNames().map(name =>
		`declare var ${name}: ReturnType<typeof import('xxscreeps/game/runtime')['globalTypes']>['${name}'];\n` +
		`declare type ${name} = TypeFor<ReturnType<typeof import('xxscreeps/game/runtime')['globalTypes']>['${name}']>;\n`).join(''),
	'utf8');
