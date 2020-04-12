import { Endpoint } from '~/backend/endpoint';
import * as FlagSchema from '~/engine/schema/flag';
import { RunnerUserMessage } from '~/engine/service/runner';
import * as Id from '~/engine/util/schema/id';
import * as C from '~/game/constants';
import { checkCreateFlag, Color } from '~/game/flag';
import { extractPositionId, RoomPosition } from '~/game/position';
import { Channel } from '~/storage/channel';

const CreateFlagEndpoint: Endpoint = {
	path: '/create-flag',
	method: 'post',

	execute(req) {
		const { userid } = req;
		const { name, color, secondaryColor, room, x, y } = req.body;
		const pos = new RoomPosition(x, y, room);
		if (checkCreateFlag({}, pos, name, color, secondaryColor) === C.OK) {
			Channel.publish<RunnerUserMessage>(
				`user/${userid}/runner`,
				{
					type: 'flag',
					intent: {
						create: {
							name: name as string,
							pos: extractPositionId(pos),
							color: color as Color,
							secondaryColor: secondaryColor as Color,
						},
					},
				},
			);
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
		const { userid } = req;
		const flagsBlob = await this.context.blobStorage.load(`user/${userid}/flags`).catch(() => {});
		if (flagsBlob) {
			const flags = FlagSchema.read(flagsBlob);
			for (let ii = 0; ii < 100; ++ii) {
				const name = `Flag${ii}`;
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

	execute(req) {
		const { userid } = req;
		const { name } = req.body;
		Channel.publish<RunnerUserMessage>(
			`user/${userid}/runner`,
			{
				type: 'flag',
				intent: {
					remove: { name: name as string },
				},
			},
		);
		return { ok: 1 };
	},
};

export default [ CreateFlagEndpoint, GenUniqueFlagNameEndpoint, RemoveFlagEndpoint ];
