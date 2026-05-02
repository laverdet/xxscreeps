import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as Path from 'node:path';
import { parse as parseVdf } from '@node-steam/vdf';
import { Fn } from 'xxscreeps/functional/fn.js';

export interface ClientPackage {
	data: Buffer;
	path: string;
	stat: Awaited<ReturnType<typeof fs.stat>>;
}

export interface PackageSearchResult {
	attemptedPaths: string[];
	clientPackage: ClientPackage | undefined;
}

export interface DiscoveryOptions {
	env?: NodeJS.ProcessEnv;
	home?: string;
	platform?: NodeJS.Platform;
	readTextFile?: (path: string) => Promise<string>;
}

interface PlatformPath {
	isAbsolute: (path: string) => boolean;
	join: (...paths: string[]) => string;
}

const steamAppsDirectories = [ 'steamapps', 'SteamApps' ];

function pathForPlatform(platform: NodeJS.Platform): PlatformPath {
	return platform === 'win32' ? Path.win32 : Path.posix;
}

function defaultSteamRoots(options: DiscoveryOptions): string[] {
	const platform = options.platform ?? process.platform;
	const path = pathForPlatform(platform);
	const home = options.home ?? os.homedir();
	const env = options.env ?? process.env;
	if (platform === 'darwin') {
		return [ path.join(home, 'Library', 'Application Support', 'Steam') ];
	}
	if (platform === 'win32') {
		return [
			path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'),
			path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Steam'),
		];
	}
	return [
		path.join(home, '.steam', 'steam'),
		path.join(home, '.local', 'share', 'Steam'),
		path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
	];
}

function packagePathsForLibrary(platformPath: PlatformPath, library: string): string[] {
	return steamAppsDirectories.map(
		steamApps => platformPath.join(library, steamApps, 'common', 'Screeps', 'package.nw'),
	);
}

function parseLibraryFoldersVdf(data: string, path: PlatformPath): string[] {
	let parsed: Record<string, unknown>;
	try {
		parsed = parseVdf(data) as Record<string, unknown>;
	} catch {
		return [];
	}
	const root = (parsed.LibraryFolders ?? parsed.libraryfolders) as Record<string, unknown> | undefined;
	if (root === undefined) return [];
	// Legacy `LibraryFolders` keyed digits to bare path strings; modern
	// `libraryfolders` keys digits to objects whose `path` field carries the
	// library root alongside other metadata.
	const libraries = Object.values(root).flatMap(value => {
		if (typeof value === 'string') return [ value ];
		if (typeof value === 'object' && value !== null && 'path' in value && typeof value.path === 'string') {
			return [ value.path ];
		}
		return [];
	});
	return [ ...new Set(libraries) ].filter(library => path.isAbsolute(library));
}

async function discoverSteamLibraries(steamRoot: string, platformPath: PlatformPath, options: DiscoveryOptions): Promise<string[]> {
	const readTextFile = options.readTextFile ?? ((path: string) => fs.readFile(path, 'utf8'));
	const libraries = await Fn.mapAwait(steamAppsDirectories, async steamApps => {
		try {
			const data = await readTextFile(platformPath.join(steamRoot, steamApps, 'libraryfolders.vdf'));
			return parseLibraryFoldersVdf(data, platformPath);
		} catch {
			return [];
		}
	});
	return [ ...new Set(libraries.flat()) ];
}

export async function discoverPackagePaths(options: DiscoveryOptions = {}): Promise<string[]> {
	const platform = options.platform ?? process.platform;
	const path = pathForPlatform(platform);
	const roots = defaultSteamRoots(options);
	const secondaryLists = await Fn.mapAwait(roots, steamRoot => discoverSteamLibraries(steamRoot, path, options));
	const libraries = [ ...new Set([ ...roots, ...secondaryLists.flat() ]) ];
	return [ ...new Set(libraries.flatMap(library => packagePathsForLibrary(path, library))) ];
}

export function packageNotFoundMessage(attemptedPaths: string[]): string {
	const locations = attemptedPaths.length === 0
		? [ 'Attempted locations: none' ]
		: [ 'Attempted locations:', ...attemptedPaths.map(path => `  - ${path}`) ];
	return [
		'@xxscreeps/client error: Could not locate Screeps `package.nw`.',
		...locations,
		'Please set `browserClient.package` in `.screepsrc.yaml` to the full path of your package.nw file:',
		'browserClient:',
		'  package: /full/path/to/package.nw',
	].join('\n');
}

export async function findClientPackage(configuredPath: string | undefined, options: DiscoveryOptions = {}): Promise<PackageSearchResult> {
	const attemptedPaths = configuredPath === undefined
		? await discoverPackagePaths(options)
		: [ configuredPath ];
	for (const path of attemptedPaths) {
		try {
			const [ data, stat ] = await Promise.all([
				fs.readFile(path),
				fs.stat(path),
			]);
			return {
				attemptedPaths,
				clientPackage: { data, path, stat },
			};
		} catch {}
	}
	return { attemptedPaths, clientPackage: undefined };
}
