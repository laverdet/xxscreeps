import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Registry from 'winreg';

/**
 * Get the path to the Screeps game files.
 */
export async function loadScreepsClientPackage() {
	const { env } = process;
	// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
	switch (process.platform) {
		case 'darwin': {
			// MacOS, checks for screeps in the default Steam location
			const steamPath = path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
			return loadScreepsClientPackageFrom(steamPath);
		}

		case 'linux': {
			// WSL support, checks for screeps in the default Steam location on the Windows host
			if (env.WSL_DISTRO_NAME !== undefined) {
				const mountPath = '/mnt';
				const mountDrives = (await fs.readdir(mountPath)).filter(name => name.length === 1);
				for (const drive of mountDrives) {
					const steamPath = path.join(mountPath, drive, 'Program Files (x86)', 'Steam');
					const screepsPath = await loadScreepsClientPackageFrom(steamPath);
					if (screepsPath != null) {
						return screepsPath;
					}
				}
			}

			// Linux, checks for screeps in common Steam locations within the user's home directory
			for (const dir of [
				[ '.steam', 'root', 'steam' ], // steam root symlink
				[ '.steam', 'steam' ], // ubuntu's multiverse repository
				[ '.local', 'share', 'Steam' ], // steam.deb on steampowered site
				[ '.var', 'app', 'com.valvesoftware.Steam', '.steam' ], // flatpak
				[ 'snap', 'steam' ], // snapcraft
			]) {
				const steamPath = path.join(os.homedir(), ...dir);
				const screepsPath = await loadScreepsClientPackageFrom(steamPath);
				if (screepsPath != null) {
					return screepsPath;
				}
			}
			return null;
		}

		case 'win32': {
			// Windows, checks for screeps in Steam location from the Windows registry
			const regSteamPath = await new Promise<string | null>(resolve => {
				const regKey = new Registry({ hive: Registry.HKLM, key: '\\SOFTWARE\\WOW6432Node\\Valve\\Steam' });
				regKey.get('InstallPath', (err: Error | null, item) => resolve(err ? null : item.value));
			});
			if (regSteamPath != null) {
				const screepsPath = await loadScreepsClientPackageFrom(regSteamPath);
				if (screepsPath != null) {
					return screepsPath;
				}
			}

			// Windows fallback, checks for screeps in the default Steam location
			const programFilesPath = env['PROGRAMFILES(X86)'] ?? path.join(env.SystemDrive ?? 'C:', 'Program Files (x86)');
			const envSteamPath = path.join(programFilesPath, 'Steam');
			return loadScreepsClientPackageFrom(envSteamPath);
		}
	}
}

/**
 * Attempts to load package.nw from the given steam path
 */
async function loadScreepsClientPackageFrom(steamPath: string) {
	const screepsPath = path.join(steamPath, 'steamapps', 'common', 'Screeps', 'package.nw');
	try {
		const [ data, stat ] = await Promise.all([
			fs.readFile(screepsPath),
			fs.stat(screepsPath),
		]);
		return { data, stat };
	} catch {
		return null;
	}
}
