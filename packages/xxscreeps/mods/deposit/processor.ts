import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { calculatePower } from 'xxscreeps/mods/creep/creep.js';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor.js';
import { DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
import * as Resource from 'xxscreeps/mods/resource/processor/resource.js';
import { Deposit } from './deposit.js';

registerHarvestProcessor(Deposit, (creep, deposit) => {
	const amount = calculatePower(creep, C.WORK, C.HARVEST_DEPOSIT_POWER, 'harvest');
	const overflow = Math.max(amount - creep.store.getFreeCapacity(deposit.depositType), 0);
	creep.store['#add'](deposit.depositType, amount - overflow);
	if (overflow > 0) {
		Resource.drop(creep.pos, deposit.depositType, overflow);
	}
	deposit['#harvested'] += amount;
	const cooldown = Math.ceil(DEPOSIT_EXHAUST_MULTIPLY * deposit['#harvested'] ** DEPOSIT_EXHAUST_POW);
	deposit['#lastCooldown'] = cooldown;
	if (cooldown > 1) {
		deposit['#cooldownTime'] = Game.time + cooldown;
	}
	deposit['#nextDecayTime'] = Game.time + DEPOSIT_DECAY_TIME;
	return amount;
});

registerObjectTickProcessor(Deposit, (deposit, context) => {
	const nextDecayTime = deposit['#nextDecayTime'];
	if (nextDecayTime !== 0 && Game.time >= nextDecayTime) {
		deposit.room['#removeObject'](deposit);
		context.didUpdate();
	} else if (nextDecayTime !== 0) {
		context.wakeAt(nextDecayTime);
	}
});
