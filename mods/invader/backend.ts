import * as Game from 'xxscreeps/game';
import { registerBackendRoute } from 'xxscreeps/backend';
import { loadRoom, saveRoom } from 'xxscreeps/backend/model/room';
import { insertObject } from 'xxscreeps/game/room/methods';
import { RoomPosition } from 'xxscreeps/game/position';
import { activateNPC } from 'xxscreeps/mods/npc/processor';
import { create } from './processor';

registerBackendRoute({
	path: '/game/create-invader',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const { room: roomName, x, y, size, type } = req.body;
		const pos = new RoomPosition(x, y, roomName);
		if (
			(size !== 'big' && size !== 'small') ||
			![ 'healer', 'melee', 'ranged' ].includes(type)
		) {
			return;
		}

		// Modify room state
		await this.context.gameMutex.scope(async() => {
			const room = await loadRoom(this.context, pos.roomName);
			if (room.controller?.owner !== userid) {
				return;
			}
			activateNPC(room, '2');
			insertObject(room, create(pos, type, size, Game.time + 200));
			await saveRoom(this.context, room);
		});
		return { ok: 1 };
	},
});
