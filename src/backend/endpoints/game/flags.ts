import type { Endpoint } from 'xxscreeps/backend';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
import * as Id from 'xxscreeps/engine/schema/id';
import * as C from 'xxscreeps/game/constants';
import { loadUserFlags } from 'xxscreeps/engine/model/user';
import { checkCreateFlag } from 'xxscreeps/game/flag';
import { PositionInteger, RoomPosition } from 'xxscreeps/game/position';

const CreateFlagEndpoint: Endpoint = {
	path: '/api/game/create-flag',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { name, color, secondaryColor, room, x, y } = context.request.body;
		const pos = new RoomPosition(x, y, room);
		if (checkCreateFlag({}, pos, name, color, secondaryColor) === C.OK) {
			await getRunnerUserChannel(context.shard, userId!).publish({
				type: 'intent',
				intent: {
					receiver: 'flag',
					intent: 'create',
					params: [
						name, pos[PositionInteger],
						color, secondaryColor,
					],
				},
			});
			return { ok: 1 };
		} else {
			return { error: 'Invalid intent' };
		}
	},
};

const GenUniqueFlagNameEndpoint: Endpoint = {
	path: '/api/game/gen-unique-flag-name',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		try {
			const flags = await loadUserFlags(context.shard, userId!);
			for (let ii = 0; ii < 100; ++ii) {
				const name = `Flag${ii}`;
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (!flags[name]) {
					return { ok: 1, name };
				}
			}
			return { ok: 1, name: `Flag${Id.generateId(6)}` };
		} catch (err) {
			return { ok: 1, name: 'Flag1' };
		}
	},
};

const RemoveFlagEndpoint: Endpoint = {
	path: '/api/game/remove-flag',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { name } = context.request.body;
		await getRunnerUserChannel(context.shard, userId!)
			.publish({
				type: 'intent',
				intent: {
					receiver: 'flag',
					intent: 'remove',
					params: [ name ],
				},
			});
		return { ok: 1 };
	},
};

export default [ CreateFlagEndpoint, GenUniqueFlagNameEndpoint, RemoveFlagEndpoint ];
