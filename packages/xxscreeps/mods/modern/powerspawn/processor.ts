import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { incrementGlobalPowerLevel } from './model.js';
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
		context.task(incrementGlobalPowerLevel(context.shard, powerSpawn['#user']!, 1));
		context.incrementRoomStat?.(powerSpawn['#user'], 'powerProcessed', 1);
		context.didUpdate();
	}),
];
