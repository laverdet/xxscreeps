import * as fs from 'node:fs/promises';
import config from 'xxscreeps/config/raw.js';

const specifier = config.runner?.sandbox === 'experimental'
	? '@xxscreeps/pathfinder/iv'
	: '@xxscreeps/pathfinder';
await fs.writeFile(new URL('./active.js', import.meta.url), `export * from ${JSON.stringify(specifier)};\n`);
