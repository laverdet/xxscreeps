import { hooks } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import './openid.js';
import './ticket.js';

const { steamApiKey } = config.backend;
if (steamApiKey === undefined) {
	console.warn('Config `backend.steamApiKey` missing; Steam login inactive');
}

hooks.register('sendUserInfo', async (db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const { steam } = await User.findProvidersForUser(db, userId);
		if (steam !== undefined) {
			userInfo.steam = { id: steam };
		}
	}
});
