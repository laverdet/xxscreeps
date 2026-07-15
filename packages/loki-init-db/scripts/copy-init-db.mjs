import * as fs from 'node:fs/promises';

const launcherPath = new URL('.', import.meta.resolve('@screeps/launcher/package.json'));

await fs.mkdir('init_dist', { recursive: true });
await fs.copyFile(new URL('init_dist/db.json', launcherPath), 'init_dist/db.json');
