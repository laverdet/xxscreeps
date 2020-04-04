import { Endpoint } from '~/backend/endpoint';
import * as Code from '~/engine/metadata/code';

export const CodeEndpoint: Endpoint = {
	path: '/code',

	async execute(req) {
		const { userid } = req;
		if (userid === undefined) {
			return { ok: 1 };
		}
		const code = await this.context.blobStorage.load(`user/${userid}/branches`);
		return {
			ok: 1,
			branch: 'master',
			modules: {},
		};
	},
};
