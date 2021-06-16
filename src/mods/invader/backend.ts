import { Game } from 'xxscreeps/game';
import { hooks } from 'xxscreeps/backend';
import { RoomPosition } from 'xxscreeps/game/position';
import { activateNPC } from 'xxscreeps/mods/npc/processor';
import { flushUsers } from 'xxscreeps/game/room/room';
import { create } from './processor';

hooks.register('route', {
	path: '/api/game/create-invader',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { room: roomName, x, y, size, type } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);
		if (
			(size !== 'big' && size !== 'small') ||
			![ 'healer', 'melee', 'ranged' ].includes(type)
		) {
			return;
		}

		// Modify room state
		await context.backend.gameMutex.scope(async() => {
			const room = await context.shard.loadRoom(pos.roomName);
			if (room.controller?.['#user'] !== userId) {
				return;
			}
			activateNPC(room, '2');
			room['#insertObject'](create(pos, type, size, Game.time + 200));
			room['#flushObjects']();
			flushUsers(room);
			await context.shard.saveRoom(pos.roomName, context.shard.time, room);
		});
		return { ok: 1 };
	},
});
