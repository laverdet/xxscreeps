import * as Game from 'xxscreeps/game';
import { registerBackendRoute } from 'xxscreeps/backend';
import { InsertObject } from 'xxscreeps/game/room';
import { RoomPosition } from 'xxscreeps/game/position';
import { activateNPC } from 'xxscreeps/mods/npc/processor';
import { create } from './processor';

registerBackendRoute({
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
			if (room.controller?.owner !== userId) {
				return;
			}
			activateNPC(room, '2');
			room[InsertObject](create(pos, type, size, Game.time + 200));
			await context.shard.saveRoom(pos.roomName, context.shard.time, room);
		});
		return { ok: 1 };
	},
});
