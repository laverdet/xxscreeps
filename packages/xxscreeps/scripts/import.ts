import type { Payload } from 'xxscreeps/scripts/payload.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import jsYaml from 'js-yaml';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config, configPath, makeInitializationDefaults } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { kInvaderUserId } from 'xxscreeps/mods/classic/invader/game.js';
import { importPayload, seedShard } from 'xxscreeps/scripts/payload.js';

async function writeDefaultConfig() {
	const rcInfo = await fs.stat(configPath).catch(() => undefined);
	if ((rcInfo?.size ?? 0) > 0) {
		return;
	}
	console.log('Writing default `.screepsrc.yaml`');

	// Get default `mods`
	const fetched = new Set<string>();
	const mods = new Set<string>(config.mods);
	const fetch = async function(specifier: string, depth: number) {
		if (depth === 0 || fetched.has(specifier)) {
			return;
		}
		fetched.add(specifier);
		try {
			// Find `package.json` for this specifier. Anchor `.` on cwd;
			const indexPath = specifier === '.'
				? pathToFileURL(process.cwd() + path.sep)
				: new URL(import.meta.resolve(specifier));
			const packagePath = await async function() {
				let path = indexPath;
				while (true) {
					const packagePath = new URL('package.json', path);
					try {
						await fs.stat(packagePath);
						return packagePath;
					} catch {}
					const next = new URL('..', path);
					if (`${next}` === `${path}`) {
						return;
					}
					path = next;
				}
			}();
			// Read package.json contents
			if (packagePath) {
				interface PackageInfo { dependencies?: Record<string, string>; name: string; xxscreeps?: unknown }
				const info = JSON.parse(await fs.readFile(packagePath, 'utf8')) as PackageInfo;
				const dependencies = Object.keys(info.dependencies ?? {});
				await Promise.all(dependencies.map(specifier => fetch(specifier, depth - 1)));
				if (info.xxscreeps) {
					mods.add(info.name);
				}
			}
		} catch {}
	};
	await fetch('.', 2);

	// Write yaml content
	const schema = function() {
		try {
			return import.meta.resolve('xxscreeps/config.schema.json');
		} catch {}
	}();
	const preamble = schema === undefined ? '' : `# yaml-language-server: $schema=${schema}\n`;
	const defaultConfig = makeInitializationDefaults();
	defaultConfig.mods = [ ...mods ];
	await fs.writeFile(configPath, preamble + jsYaml.dump(defaultConfig));
}

async function main() {
	const argv = checkArguments({
		argv: true,
		boolean: [ 'dont-overwrite', 'shard-only' ] as const,
	});
	const file = argv.argv[0] ?? new URL('../../scripts/data/shard.json', import.meta.url);

	await writeDefaultConfig();
	const payload = JSON.parse(await fs.readFile(file, 'utf8')) as Payload;
	const world = importPayload(payload);

	// Initialize and connect to database & shard
	await using db = await Database.connect();
	if (argv['dont-overwrite'] && await db.data.sCard('users') > 0) {
		console.log('Found existing data, exiting');
		return;
	}
	const shardName = config.shards[0]!.name;
	await using shard = await Shard.connect(db, shardName);
	await Promise.all([
		argv['shard-only'] ? undefined : db.data.flushdb(),
		shard.data.flushdb(),
		shard.scratch.flushdb(),
	]);

	await seedShard(shard, world);
	if (!argv['shard-only']) {
		await Fn.mapAwait(Object.entries(User.npcUsers), ([ userId, username ]) => User.create(db, userId, username));
		await Badge.save(db, kInvaderUserId, JSON.stringify(Badge.invaderBadge));
	}
	await Promise.all([ db.save(), shard.save() ]);
	const count = world.rooms.length;
	console.log(`Imported ${count} room${count === 1 ? '' : 's'} into ${shardName}`);
}

if (process.argv[1] === 'import') {
	await main();
}
