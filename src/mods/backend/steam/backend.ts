import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';
import './openid.js';
import './ticket.js';

const { steamApiKey } = config.backend;
if (!steamApiKey) {
	console.warn('Config `backend.steamApiKey` missing; Steam login inactive');
}

hooks.register('sendUserInfo', async(db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const providers = await User.findProvidersForUser(db, userId);
		if (providers.steam) {
			userInfo.steam = { id: providers.steam };
		}
	}
});
