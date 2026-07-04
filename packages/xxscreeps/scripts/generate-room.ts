import type { GenerateRoomOptions } from 'xxscreeps/scripts/room-gen.js';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { generateRoom } from 'xxscreeps/scripts/room-gen.js';

function parseOptionalInteger(value: string | undefined, name: string, min: number, max: number) {
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
		throw new Error(`${name} must be an integer from ${min} to ${max}`);
	}
	return parsed;
}

async function main() {
	const argv = checkArguments({
		argv: true,
		string: [ 'shard', 'terrain-type', 'swamp-type' ] as const,
	});
	const roomName = argv.argv[0];
	if (roomName === undefined) {
		console.log('Usage: xxscreeps generate-room <room> [--shard shard] [--terrain-type 1-28] [--swamp-type 0-14]');
		process.exitCode = 1;
		return;
	}

	const terrainType = parseOptionalInteger(argv['terrain-type'], 'terrain-type', 1, 28);
	const swampType = parseOptionalInteger(argv['swamp-type'], 'swamp-type', 0, 14);
	const options: GenerateRoomOptions = {
		...terrainType !== undefined && { terrainType },
		...swampType !== undefined && { swampType },
	};

	await using db = await Database.connect();
	await using shard = await Shard.connect(db, argv.shard ?? config.shards[0]!.name);
	const room = await generateRoom(shard, roomName, options);
	await Promise.all([ db.save(), shard.save() ]);
	console.log(`Generated room ${room.name}`);
}

if (process.argv[1] === 'generate-room') {
	await main();
}
