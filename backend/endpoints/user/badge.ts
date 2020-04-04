import { Endpoint } from '~/backend/endpoint';
import * as Badge from '~/engine/metadata/badge';
import * as User from '~/engine/metadata/user';

export const BadgeEndpoint: Endpoint = {
	path: '/badge',
	method: 'post',

	async execute(req) {
		const { userid } = req;
		if (userid === undefined) {
			return { ok: 1 };
		}
		const badge = Badge.validate(req.body.badge);
		await this.context.gameMutex.scope(async() => {
			const fragment = `user/${userid}/info`;
			const user = User.read(await this.context.blobStorage.load(fragment));
			user.badge = JSON.stringify(badge);
			await this.context.blobStorage.save(fragment, User.write(user));
		});
		return { ok: 1 };
	},
};
