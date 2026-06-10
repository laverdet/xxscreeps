import type { ConstructibleStructureType } from './construction-site.js';
import type { JSONSchemaType } from 'ajv';
import { bindRenderer, hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { runOneShot } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room.js';
import { ConstructionSite } from './construction-site.js';

bindRenderer(ConstructionSite, (constructionSite, next) => ({
	...next(),
	progress: constructionSite.progress,
	progressTotal: constructionSite.progressTotal,
	structureType: constructionSite.structureType,
	user: constructionSite['#user'],
}));

interface CreateConstructionIntentRequest {
	name?: string | null;
	room: string;
	shard?: string | null;
	structureType: string;
	x: number;
	y: number;
}

const createConstructionIntentRequestSchema: JSONSchemaType<CreateConstructionIntentRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
		shard: { type: 'string', nullable: true },
		x: { type: 'number' },
		y: { type: 'number' },
		structureType: { type: 'string' },
		name: { type: 'string', nullable: true },
	},
	required: [ 'room', 'x', 'y', 'structureType' ],
};

hooks.register('route', {
	path: '/api/game/create-construction',
	method: 'post',
	execute: makeValidatedPayloadRoute(createConstructionIntentRequestSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return;
		}
		const { name, room: roomName, x, y, structureType } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);
		const room = await context.shard.loadRoom(pos.roomName);
		const result = runOneShot(context.backend.world, room, context.shard.time, userId,
			() => checkCreateConstructionSite(room, pos, structureType as ConstructibleStructureType, name));
		if (result === C.OK) {
			await pushIntentsForRoomNextTick(context.shard, roomName, userId, {
				local: {
					createConstructionSite: [
						[ structureType, pos.x, pos.y, name ],
					],
				},
				object: {},
			});
			// nb: Screeps actually just inserts this object directly into the database from the backend,
			// so it can give the client an id immediately. Instead, we return an error and rely on the
			// socket to show the construction site on tick.
			return { error: 'actually, it was fine' };
		} else {
			return { error: 'invalid' };
		}
	}),
});
