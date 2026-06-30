import type { RoomType } from 'xxscreeps/game/room/sector.js';
import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import type { GenerateRoomOptions } from 'xxscreeps/scripts/room-gen.js';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { generateRoom, mineralPool, roomTypeTemplates } from 'xxscreeps/scripts/room-gen.js';

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

function parseMineralType(value: string | undefined, noMineral: boolean): ResourceType | false | undefined {
	if (noMineral) {
		return false;
	}
	if (value === undefined) {
		return undefined;
	}
	if (!isMineralType(value)) {
		throw new Error(`mineral must be one of ${[ ...mineralTypes ].join(', ')}`);
	}
	return value;
}

// Friendly `--type` names mapped to their RoomType template key.
const roomTypeAliases: Record<string, RoomType> = {
	normal: 'normal',
	keeper: 'sourceKeeper',
	center: 'center',
	highway: 'highway',
};

function parseRoomType(value: string | undefined): RoomType | undefined {
	if (value === undefined) {
		return undefined;
	}
	const type = roomTypeAliases[value];
	if (type === undefined) {
		throw new Error(`type must be one of ${Object.keys(roomTypeAliases).join(', ')}`);
	}
	return type;
}

// The room-shape option flags.
interface RoomGenArgv {
	'terrain-type'?: string;
	'swamp-type'?: string;
	sources?: string;
	mineral?: string;
	'no-mineral'?: boolean;
	'no-controller'?: boolean;
	'keeper-lairs'?: boolean;
}

export function parseRoomOptions(argv: RoomGenArgv): GenerateRoomOptions {
	const terrainType = parseOptionalInteger(argv['terrain-type'], 'terrain-type', 1, 28);
	const swampType = parseOptionalInteger(argv['swamp-type'], 'swamp-type', 0, 14);
	const sources = parseOptionalInteger(argv.sources, 'sources', 1, 4);
	const mineral = parseMineralType(argv.mineral, argv['no-mineral'] ?? false);
	return {
		...terrainType !== undefined && { terrainType },
		...swampType !== undefined && { swampType },
		...sources !== undefined && { sources },
		...mineral !== undefined && { mineral },
		controller: !argv['no-controller'],
		keeperLairs: argv['keeper-lairs'] ?? false,
	};
}

async function main() {
	const argv = checkArguments({
		argv: true,
		boolean: [ 'keeper-lairs', 'no-controller', 'no-mineral' ] as const,
		string: [ 'shard', 'type', 'terrain-type', 'swamp-type', 'sources', 'mineral' ] as const,
	});
	const roomName = argv.argv[0];
	if (roomName === undefined) {
		console.log('Usage: xxscreeps generate-room <room> [--type normal|keeper|center|highway] [--shard shard] [--terrain-type 1-28] [--swamp-type 0-14] [--sources 1-4] [--mineral H|O|Z|K|U|L|X | --no-mineral] [--no-controller] [--keeper-lairs]');
		process.exitCode = 1;
		return;
	}

	// A `--type` preset applies its canonical loadout over the shape flags, so the type wins.
	const type = parseRoomType(argv.type);
	const options = type === undefined
		? parseRoomOptions(argv)
		: { ...parseRoomOptions(argv), ...roomTypeTemplates[type] };

	await using db = await Database.connect();
	await using shard = await Shard.connect(db, argv.shard ?? config.shards[0]!.name);
	const room = await generateRoom(shard, roomName, options);
	await Promise.all([ db.save(), shard.save() ]);
	console.log(`Generated room ${room.name}`);
}

if (process.argv[1] === 'generate-room') {
	await main();
}
