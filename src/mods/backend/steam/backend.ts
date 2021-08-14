import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/backend';
import config from 'xxscreeps/config';
import './openid';
import './ticket';

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
