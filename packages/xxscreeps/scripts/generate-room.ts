import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { GenerateRoomOptions } from 'xxscreeps/scripts/room-gen.js';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { generateRoom, mineralPool } from 'xxscreeps/scripts/room-gen.js';

const mineralTypes = new Set<string>(mineralPool);

function isMineralType(value: string): value is ResourceType {
	return mineralTypes.has(value);
}

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

function parseMineralType(value: string | undefined) {
	if (value === undefined || isMineralType(value)) {
		return value;
	}
	throw new Error(`mineral must be one of ${[ ...mineralTypes ].join(', ')}`);
}

async function main() {
	const argv = checkArguments({
		argv: true,
		string: [ 'shard', 'terrain-type', 'swamp-type', 'sources', 'mineral' ] as const,
	});
	const roomName = argv.argv[0];
	if (roomName === undefined) {
		console.log('Usage: xxscreeps generate-room <room> [--shard shard] [--terrain-type 1-28] [--swamp-type 0-14] [--sources 1-4] [--mineral H|O|Z|K|U|L|X]');
		process.exitCode = 1;
		return;
	}

	const terrainType = parseOptionalInteger(argv['terrain-type'], 'terrain-type', 1, 28);
	const swampType = parseOptionalInteger(argv['swamp-type'], 'swamp-type', 0, 14);
	const sources = parseOptionalInteger(argv.sources, 'sources', 1, 4);
	const mineral = parseMineralType(argv.mineral);
	const options: GenerateRoomOptions = {
		...terrainType !== undefined && { terrainType },
		...swampType !== undefined && { swampType },
		...sources !== undefined && { sources },
		...mineral !== undefined && { mineral },
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
