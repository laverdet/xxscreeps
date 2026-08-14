import { checkArguments } from 'xxscreeps/config/arguments.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { parseRoomOptions, roomOptionArguments } from 'xxscreeps/scripts/generate-room.js';
import { findWorldBoundary, sealWorldBoundary } from 'xxscreeps/scripts/room-gen.js';

// Walls off the world's outer boundary: every room opening onto a room the world doesn't have is
// rebuilt with that side sealed, so the edge of the map reads as terrain rather than as exits into
// nothing. `--dry-run` lists the rooms it would rebuild. Shares the room-shape flags with
// `generate-room`; they apply to the boundary's normal rooms. See `sealWorldBoundary` for when in a
// world's life this runs.
async function main() {
	const argv = checkArguments({
		boolean: [ 'dry-run' ] as const,
		string: [ 'shard', ...roomOptionArguments ] as const,
	});

	const options = parseRoomOptions(argv);
	await using db = await Database.connect();
	await using shard = await Shard.connect(db, argv.shard ?? config.shards[0]!.name);
	if (argv['dry-run']) {
		const boundary = await findWorldBoundary(shard);
		for (const { roomName, sealed } of boundary) {
			console.log(`${roomName}: ${sealed.join(', ')}`);
		}
		console.log(`${boundary.length} room${boundary.length === 1 ? '' : 's'} on the world boundary`);
		return;
	}

	const rooms = await sealWorldBoundary(shard, options);
	await Promise.all([ db.save(), shard.save() ]);
	console.log(`Sealed ${rooms.length} boundary room${rooms.length === 1 ? '' : 's'}`);
}

if (process.argv[1] === 'seal-world') {
	await main();
}
