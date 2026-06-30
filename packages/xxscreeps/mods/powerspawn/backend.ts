import { bindRenderer, hooks } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructurePowerSpawn } from './powerspawn.js';

bindRenderer(StructurePowerSpawn, (powerSpawn, next) => ({
	...next(),
	...renderStore(powerSpawn.store),
}));

// Surface accumulated power (GPL experience) so the client can display the Global Power Level.
hooks.register('sendUserInfo', async (db, userId, userInfo) => {
	Object.assign(userInfo, { power: Number(await db.data.hGet(User.infoKey(userId), 'power')) || 0 });
});
