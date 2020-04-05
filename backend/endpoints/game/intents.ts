import * as C from '~/game/constants';
import { Endpoint } from '~/backend/endpoint';
import * as RoomSchema from '~/engine/schema/room';
import * as RoomIntents from '~/engine/processor/intents/room';
import * as SpawnIntents from '~/engine/processor/intents/spawn';
import { RoomPosition } from '~/game/position';

const CheckUniqueNameEndpoint: Endpoint = {
	path: '/check-unique-object-name',
	method: 'post',

	execute(req) {
		if (req.body.type === 'spawn') {
			return { ok: 1 };
		}
	},
};

const GenNameEndpoint: Endpoint = {
	path: '/gen-unique-object-name',
	method: 'post',

	execute(req) {
		if (req.body.type === 'spawn') {
			return { ok: 1, name: 'Spawn1' };
		}
	},
};

const PlaceSpawnEndpoint: Endpoint = {
	path: '/place-spawn',
	method: 'post',

	async execute(req) {
		const { userid } = req;
		const { name, room, x, y } = req.body;
		const pos = new RoomPosition(x, y, room);
		await this.context.gameMutex.scope(async() => {
			const fragment = `ticks/${this.context.time}/${pos.roomName}`;
			// Insert spawn
			const room = RoomSchema.read(await this.context.blobStorage.load(fragment));
			RoomIntents.insertObject(room, SpawnIntents.create(pos, userid!, name));
			// Take controller
			const controller = room.controller!;
			controller._owner = userid!;
			controller._downgradeTime = 0;
			controller._progress = 0;
			controller.safeMode = Game.time + C.SAFE_MODE_DURATION;
			controller.level = 1;
			// Save room data
			await this.context.blobStorage.save(fragment, RoomSchema.write(room));
		});
		return { ok: 1 };
	},
};

export default [ CheckUniqueNameEndpoint, GenNameEndpoint, PlaceSpawnEndpoint ];
