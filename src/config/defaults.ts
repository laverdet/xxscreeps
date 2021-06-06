import type { RecursivePartial } from 'xxscreeps/utility/types';
import type { Schema } from './schema';
import * as Crypto from 'crypto';
import os from 'os';

function makeDefaults<Type extends RecursivePartial<Schema>>(defaults: Type) {
	return defaults;
}

export const defaults = makeDefaults({
	backend: {
		allowGuestAccess: true as boolean,
		bind: 'localhost',
		secret: Crypto.randomBytes(32).toString(),
	},
	game: {
		tickSpeed: 250,
	},
	launcher: {
		processorWorkers: os.cpus().length + 1,
		runnerWorkers: 1,
	},
	mods: [
		'xxscreeps/mods/classic',
		'xxscreeps/mods/backend/password',
	],
	runner: {
		concurrency: os.cpus().length + 1,
	},
	schemaArchive: './screeps/archive',
	database: {
		blob: './screeps/db',
		data: './screeps/db/data.json',
		pubsub: 'local://db',
	},
	shards: [ {
		name: 'shard0',
		blob: './screeps/shard0',
		data: './screeps/shard0/data.json',
		pubsub: 'local://shard0',
		scratch: 'local://shard0',
	} ],
});

export type MergedSchema = Schema & typeof defaults;
