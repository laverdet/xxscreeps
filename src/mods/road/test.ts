import assert from 'assert';
import { RoomPosition } from 'xxscreeps/game/position';
import { simulate } from 'xxscreeps/test';
import { create as createExtension } from 'xxscreeps/mods/spawn/extension';
import { create } from './road';
import { runOneShot } from 'xxscreeps/game';

await simulate({
	W0N0: room => {
		room['#insertObject'](createExtension(new RoomPosition(25, 25, 'W0N0'), 1, '100'));
		room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
	},
})(async({ shard, world }) => {
	const room = await shard.loadRoom('W0N0');
	runOneShot(world, room, shard.time, '', () => {
		const path = room.findPath(new RoomPosition(24, 24, 'W0N0'), new RoomPosition(26, 26, 'W0N0'));
		assert.strictEqual(path.length, 3);
	});
});
