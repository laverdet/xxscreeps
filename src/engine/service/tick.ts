import fsPromises from 'fs/promises';
import fs from 'fs';
import jsYaml from 'js-yaml';
import config, { configPath } from 'xxscreeps/config';
import { mustNotReject } from 'xxscreeps/utility/async';

let configTickSpeed = config.game.tickSpeed;
export let tickSpeed = configTickSpeed;

export async function watch(onUpdate?: () => void) {
	try {
		let stat = await fsPromises.stat(configPath);
		const handle = fs.watch(
			new URL('.', configPath),
			(message, fileName) => setTimeout(() => mustNotReject(async() => {
				if (fileName && fileName !== '.screepsrc.yaml') {
					return;
				}
				try {
					const nextStat = await fsPromises.stat(configPath);
					if (+stat.mtime === +nextStat.mtime) {
						return;
					}
					stat = nextStat;
					const config: any = jsYaml.load(await fsPromises.readFile(configPath, 'utf8'));
					const readTickSpeed = Number(config.game?.tickSpeed);
					if (!Number.isNaN(readTickSpeed)) {
						if (configTickSpeed !== readTickSpeed) {
							tickSpeed = configTickSpeed = Number(readTickSpeed);
							onUpdate?.();
						}
					}
				} catch (err) { console.log(err) }
			}), 100));
		return () => handle.close();
	} catch (err) {}
}
