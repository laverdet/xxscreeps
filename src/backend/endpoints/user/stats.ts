import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/backend';
import { runOnce } from 'xxscreeps/utility/memoize';
import config from 'xxscreeps/config';
const { allowGuestAccess } = config.backend;
const sendUserInfo = runOnce(() => hooks.makeMapped('sendUserInfo'));

hooks.register('route', {
	path: '/api/user/stats',

	async execute() {
		return { ok: 1, stats: {} };
	},
});
