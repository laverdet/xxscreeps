/* eslint-disable prefer-named-capture-group */
import 'xxscreeps/engine/room';
import * as C from 'xxscreeps/game/constants';
import { configPath } from 'xxscreeps/config';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { mods } from 'xxscreeps/config/mods';
import { globalNames } from 'xxscreeps/game/runtime';

// Write tsconfig
const baseDir = new URL('../../src', import.meta.url);
const localDir = new URL('.', configPath);
const paths = [ 'backend', 'config', 'driver', 'engine', 'game', 'schema', 'utility' ];
const modSources = await Promise.all(mods.map(async mod => {
	const map = JSON.parse(await fs.readFile(new URL('index.js.map', mod.url), 'utf8'));
	if (map.sources.length !== 1) {
		throw new Error('Unexpected source map manifest');
	}
	const manifest = new URL(map.sources[0], mod.url);
	return fileURLToPath(new URL('.', manifest));
}));
const tsconfig = `{
	"extends": "xxscreeps/tsconfig.base",
	"compilerOptions": {
		// Environment
		"baseUrl": ${JSON.stringify(fileURLToPath(baseDir))},
		"outFile": "screeps.exports.js",
		"paths": {
			"xxscreeps/*": [ "*" ],
		},
		"rootDir": ${JSON.stringify(fileURLToPath(new URL('/', baseDir)))}

		// Module resolution
		"isolatedModules": false,
		"module": "system",
		"resolveJsonModule": false,

		// Output
		"declaration": true,
		"declarationMap": true,
		"emitDeclarationOnly": true,
		"stripInternal": true,
	},
	"include": ${JSON.stringify([ ...paths, ...modSources ])},
}`;
const tmpPath = new URL('tsconfig.types.json', localDir);
await fs.writeFile(tmpPath, tsconfig, { encoding: 'utf8', flag: 'w' });

// Run `tsc`
console.log(tsconfig);
try {
	const proc = spawn('npx', [ 'tsc', '-p', fileURLToPath(tmpPath) ], { cwd: fileURLToPath(localDir), stdio: 'inherit' });
	await new Promise<void>(resolve => {
		proc.once('exit', () => resolve());
	});
} finally {
	await fs.unlink(tmpPath);
}

async function readAndUnlink(file: URL) {
	const result = await fs.readFile(file, 'utf8');
	await fs.unlink(file);
	return result;
}

// Read, fix, and move result
const dts = await readAndUnlink(new URL('screeps.exports.d.ts', localDir));
const dtsMap = await readAndUnlink(new URL('screeps.exports.d.ts.map', localDir));
await fs.mkdir('screeps/types', { recursive: true });
const trash = /declare module "(?<trash>[^"]+\/src)\/game\/game"/.exec(dts);
if (!trash) {
	throw new Error('Unable to take out the trash');
}
const fragment = trash.groups!.trash;
await fs.writeFile('screeps/types/screeps.exports.d.ts',
	dts
		// Fix module path names
		.replaceAll(`from "${fragment}`, 'from "xxscreeps')
		.replaceAll(`import "${fragment}`, 'import "xxscreeps')
		.replaceAll(`module "${fragment}`, 'module "xxscreeps')
		// Fix import "foo/index" emit issue
		.replace(/\/index"/g, '"')
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
