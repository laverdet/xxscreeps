import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as Path from 'node:path';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { discoverPackagePaths, findClientPackage, packageNotFoundMessage } from './package-nw.js';

interface PathJoiner {
	join: (...paths: string[]) => string;
}

interface TemporaryHome {
	home: string;
	[Symbol.asyncDispose]: () => Promise<void>;
}

async function temporaryHome(): Promise<TemporaryHome> {
	const home = await mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-client-home-'));
	return {
		home,
		async [Symbol.asyncDispose]() {
			await rm(home, { recursive: true, force: true });
		},
	};
}

function packagePath(path: PathJoiner, library: string, steamApps: string) {
	return path.join(library, steamApps, 'common', 'Screeps', 'package.nw');
}

function libraryFoldersVdf(library: string) {
	return `"libraryfolders"
{
  "1"
  {
    "path"    "${library.replace(/\\/g, '\\\\')}"
  }
}`;
}

describe('@xxscreeps/client package discovery', () => {

	test('discovers macOS default Steam library paths', async () => {
		await using tmp = await temporaryHome();
		const library = Path.posix.join(tmp.home, 'Library', 'Application Support', 'Steam');
		assert.deepStrictEqual(await discoverPackagePaths({ platform: 'darwin', home: tmp.home }), [
			packagePath(Path.posix, library, 'steamapps'),
			packagePath(Path.posix, library, 'SteamApps'),
		]);
	});

	test('discovers Windows Program Files Steam library paths', async () => {
		const programFilesX86 = 'C:\\Program Files (x86)';
		const programFiles = 'C:\\Program Files';
		assert.deepStrictEqual(await discoverPackagePaths({
			platform: 'win32',
			home: 'C:\\Users\\Test',
			env: {
				'ProgramFiles(x86)': programFilesX86,
				ProgramFiles: programFiles,
			},
		}), [
			packagePath(Path.win32, Path.win32.join(programFilesX86, 'Steam'), 'steamapps'),
			packagePath(Path.win32, Path.win32.join(programFilesX86, 'Steam'), 'SteamApps'),
			packagePath(Path.win32, Path.win32.join(programFiles, 'Steam'), 'steamapps'),
			packagePath(Path.win32, Path.win32.join(programFiles, 'Steam'), 'SteamApps'),
		]);
	});

	test('discovers Steam secondary libraries from Windows libraryfolders.vdf', async () => {
		const programFilesX86 = 'C:\\Program Files (x86)';
		const steamRoot = Path.win32.join(programFilesX86, 'Steam');
		const secondaryLibrary = 'D:\\SteamLibrary';
		const libraryFolders = Path.win32.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
		const paths = await discoverPackagePaths({
			platform: 'win32',
			home: 'C:\\Users\\Test',
			env: {
				'ProgramFiles(x86)': programFilesX86,
				ProgramFiles: 'C:\\Program Files',
			},
			readTextFile: path => path === libraryFolders
				? Promise.resolve(libraryFoldersVdf(secondaryLibrary))
				: Promise.reject(new Error(`Unexpected read: ${path}`)),
		});
		assert.ok(paths.includes(packagePath(Path.win32, secondaryLibrary, 'steamapps')));
		assert.ok(paths.includes(packagePath(Path.win32, secondaryLibrary, 'SteamApps')));
	});

	test('discovers Linux defaults and lowercase steamapps secondary libraries', async () => {
		await using tmp = await temporaryHome();
		const steamRoot = Path.posix.join(tmp.home, '.steam', 'steam');
		const secondaryLibrary = Path.posix.join(tmp.home, 'SteamLibrary');
		await mkdir(Path.posix.join(steamRoot, 'steamapps'), { recursive: true });
		await writeFile(
			Path.posix.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
			libraryFoldersVdf(secondaryLibrary),
		);

		const paths = await discoverPackagePaths({ platform: 'linux', home: tmp.home });
		assert.ok(paths.includes(packagePath(Path.posix, steamRoot, 'steamapps')));
		assert.ok(paths.includes(packagePath(Path.posix, steamRoot, 'SteamApps')));
		assert.ok(paths.includes(packagePath(
			Path.posix,
			Path.posix.join(tmp.home, '.local', 'share', 'Steam'),
			'steamapps',
		)));
		assert.ok(paths.includes(packagePath(
			Path.posix,
			Path.posix.join(tmp.home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
			'steamapps',
		)));
		assert.ok(paths.includes(packagePath(Path.posix, secondaryLibrary, 'steamapps')));
	});

	test('configured package path is attempted exactly', async () => {
		await using tmp = await temporaryHome();
		const configuredPath = 'D:\\Games\\Screeps\\package.nw';
		const result = await findClientPackage(configuredPath, {
			platform: 'linux',
			home: tmp.home,
		});
		assert.strictEqual(result.clientPackage, undefined);
		assert.deepStrictEqual(result.attemptedPaths, [ configuredPath ]);
	});

	test('findClientPackage returns the first readable discovered package', async () => {
		await using tmp = await temporaryHome();
		const expectedPath = packagePath(Path.posix, Path.posix.join(tmp.home, '.steam', 'steam'), 'steamapps');
		await mkdir(Path.dirname(expectedPath), { recursive: true });
		await writeFile(expectedPath, 'package');

		const result = await findClientPackage(undefined, { platform: 'linux', home: tmp.home });
		const { clientPackage } = result;
		if (clientPackage === undefined) {
			throw new Error('Expected to find package.nw');
		}
		assert.strictEqual(clientPackage.path, expectedPath);
		assert.deepStrictEqual(clientPackage.data, Buffer.from('package'));
	});

	test('findClientPackage loads package.nw from a secondary Steam library', async () => {
		await using tmp = await temporaryHome();
		const steamRoot = Path.posix.join(tmp.home, '.steam', 'steam');
		const secondaryLibrary = Path.posix.join(tmp.home, 'SteamLibrary');
		const libraryFolders = Path.posix.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
		const expectedPath = packagePath(Path.posix, secondaryLibrary, 'steamapps');
		await mkdir(Path.dirname(libraryFolders), { recursive: true });
		await mkdir(Path.dirname(expectedPath), { recursive: true });
		await writeFile(libraryFolders, libraryFoldersVdf(secondaryLibrary));
		await writeFile(expectedPath, 'secondary package');

		const result = await findClientPackage(undefined, { platform: 'linux', home: tmp.home });
		const { clientPackage } = result;
		if (clientPackage === undefined) {
			throw new Error('Expected to find package.nw in secondary Steam library');
		}
		assert.ok(result.attemptedPaths.includes(expectedPath));
		assert.strictEqual(clientPackage.path, expectedPath);
		assert.deepStrictEqual(clientPackage.data, Buffer.from('secondary package'));
	});

	test('packageNotFoundMessage lists attempted paths and override guidance', () => {
		const configuredPath = 'D:\\Games\\Screeps\\package.nw';
		const message = packageNotFoundMessage([ configuredPath ]);
		assert.match(message, /Attempted locations:/);
		assert.match(message, /D:\\Games\\Screeps\\package\.nw/);
		assert.match(message, /browserClient:\n {2}package: \/full\/path\/to\/package\.nw/);
	});
});
