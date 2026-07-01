import * as User from 'xxscreeps/engine/db/user/index.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { addStat } from 'xxscreeps/mods/stats/model.js';
import { StructurePowerSpawn, checkProcessPower } from './powerspawn.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { powerspawn: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructurePowerSpawn, 'processPower', {}, (powerSpawn, context) => {
		if (checkProcessPower(powerSpawn) !== C.OK) {
			return;
		}
		powerSpawn.store['#subtract'](C.RESOURCE_POWER, 1);
		powerSpawn.store['#subtract'](C.RESOURCE_ENERGY, C.POWER_SPAWN_ENERGY_RATIO);
		context.task(context.shard.db.data.hincrBy(User.infoKey(powerSpawn['#user']!), 'power', 1));
		addStat(context, powerSpawn['#user'], powerSpawn.room.name, 'powerProcessed', 1);
		context.didUpdate();
	}),
];
