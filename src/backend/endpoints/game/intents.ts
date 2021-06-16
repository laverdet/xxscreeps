import type { Endpoint } from 'xxscreeps/backend';
import * as C from 'xxscreeps/game/constants';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model';
import { runOneShot } from 'xxscreeps/game';
import { RoomPosition } from 'xxscreeps/game/position';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/api/game/add-object-intent',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { room, name, intent } = context.request.body;
		const { id } = Array.isArray(intent) ? intent[0] : intent;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		const realIntentName = {
			removeConstructionSite: 'remove',
		}[name] ?? name;
		await pushIntentsForRoomNextTick(context.shard, room, userId, {
			local: {},
			object: {
				[id]: { [realIntentName]: [] },
			},
		});
		return { ok: 1 };
	},
};

const CreateConstructionIntentEndpoint: Endpoint = {
	path: '/api/game/create-construction',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { name, room: roomName, x, y, structureType } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);
		const room = await context.shard.loadRoom(pos.roomName);
		const result = runOneShot(context.backend.world, room, context.shard.time, userId,
			() => checkCreateConstructionSite(room, pos, structureType));
		if (result === C.OK) {
			return pushIntentsForRoomNextTick(context.shard, roomName, userId, {
				local: {
					createConstructionSite: [
						[ structureType, pos.x, pos.y, name ],
					],
				},
				object: {},
			});
		}
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint, CreateConstructionIntentEndpoint ];
