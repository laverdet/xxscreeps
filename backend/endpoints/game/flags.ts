import { Endpoint } from 'xxscreeps/backend/endpoint';
import * as FlagSchema from 'xxscreeps/engine/schema/flag';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as C from 'xxscreeps/game/constants';
import { checkCreateFlag } from 'xxscreeps/game/flag';
import { extractPositionId, RoomPosition } from 'xxscreeps/game/position';

const CreateFlagEndpoint: Endpoint = {
	path: '/create-flag',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const { name, color, secondaryColor, room, x, y } = req.body;
		const pos = new RoomPosition(x, y, room);
		if (checkCreateFlag({}, pos, name, color, secondaryColor) === C.OK) {
			await getRunnerUserChannel(this.context.shard, userid!).publish({
				type: 'intent',
				intent: {
					receiver: 'flags',
					intent: 'create',
					params: {
						name,
						pos: extractPositionId(pos),
						color,
						secondaryColor,
					},
				},
			});
			return { ok: 1 };
		} else {
			return { error: 'Invalid intent' };
		}
	},
};

const GenUniqueFlagNameEndpoint: Endpoint = {
	path: '/gen-unique-flag-name',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const flagBlob = await this.context.persistence.get(`user/${userid}/flags`).catch(() => {});
		if (flagBlob) {
			const flags = FlagSchema.read(flagBlob);
			for (let ii = 0; ii < 100; ++ii) {
				const name = `Flag${ii}`;
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (!flags[name]) {
					return { ok: 1, name };
				}
			}
			return { ok: 1, name: `Flag${Id.generateId(6)}` };
		} else {
			return { ok: 1, name: 'Flag1' };
		}
	},
};

const RemoveFlagEndpoint: Endpoint = {
	path: '/remove-flag',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const { name } = req.body;
		await getRunnerUserChannel(this.context.shard, userid!)
			.publish({
				type: 'intent',
				intent: {
					receiver: 'flags',
					intent: 'remove',
					params: { name },
				},
			});
		return { ok: 1 };
	},
};

export default [ CreateFlagEndpoint, GenUniqueFlagNameEndpoint, RemoveFlagEndpoint ];
