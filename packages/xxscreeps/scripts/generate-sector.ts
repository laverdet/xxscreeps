import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { parseRoomOptions, roomOptionArguments } from 'xxscreeps/scripts/generate-room.js';
import { generateSector } from 'xxscreeps/scripts/room-gen.js';

// Generates a full sector from an origin room -- the 11x11 = 121-room block including the highway
// rings shared with adjacent sectors. Shares the room-shape flags with `generate-room`; they apply
// to the sector's normal rooms, while highways, the source-keeper ring, and the center core follow
// the vanilla mod-10 template.
async function main() {
	const argv = checkArguments({
		argv: true,
		string: [ 'shard', ...roomOptionArguments ] as const,
	});
	const origin = argv.argv[0];
	if (origin === undefined) {
		console.log('Usage: xxscreeps generate-sector <origin> [--shard shard] [--terrain-type 1-28] [--swamp-type 0-14] [--sources 1-4] [--mineral H|O|Z|K|U|L|X]');
		process.exitCode = 1;
		return;
	}

	const options = parseRoomOptions(argv);
	await using db = await Database.connect();
	await using shard = await Shard.connect(db, argv.shard ?? config.shards[0]!.name);
	const rooms = await generateSector(shard, origin, options);
	await Promise.all([ db.save(), shard.save() ]);
	console.log(`Generated ${rooms.length} room${rooms.length === 1 ? '' : 's'} from ${origin}`);
}

if (process.argv[1] === 'generate-sector') {
	await main();
}
