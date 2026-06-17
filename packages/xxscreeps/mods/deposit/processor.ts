import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { makeSectorRadiusFilter, sectorsForRoom } from 'xxscreeps/game/room/sector.js';
import { calculatePower } from 'xxscreeps/mods/creep/creep.js';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor.js';
import { DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
import * as Resource from 'xxscreeps/mods/resource/processor/resource.js';
import { Deposit } from './deposit.js';
import { scheduleSector } from './model.js';
// Registers the `precipitateDeposit` intent processor in the processor service, which applies it.
import './precipitate.js';

registerHarvestProcessor(Deposit, (creep, deposit) => {
	const amount = calculatePower(creep, C.WORK, C.HARVEST_DEPOSIT_POWER, 'harvest');
	const overflow = Math.max(amount - creep.store.getFreeCapacity(deposit.depositType), 0);
	creep.store['#add'](deposit.depositType, amount - overflow);
	if (overflow > 0) {
		Resource.drop(creep.pos, deposit.depositType, overflow);
	}
	deposit['#harvested'] += amount;
	const cooldown = Math.ceil(DEPOSIT_EXHAUST_MULTIPLY * deposit['#harvested'] ** DEPOSIT_EXHAUST_POW);
	deposit.lastCooldown = cooldown;
	if (cooldown > 1) {
		deposit['#cooldownTime'] = Game.time + cooldown;
	}
	deposit['#nextDecayTime'] = Game.time + DEPOSIT_DECAY_TIME;
	return amount;
});

registerObjectTickProcessor(Deposit, (deposit, context) => {
	if (deposit.ticksToDecay === 0) {
		// Decay just freed throughput in the owning sector — of the 1–4 candidate sectors for
		// this room, the one whose 250-tile radius contains the tile. Score 0 = due
		// immediately; the evaluator excludes deposits at their decay tick from the tally, so
		// the same-tick re-eval already sees this one gone.
		const { roomName } = deposit.pos;
		const owning = Fn.find(sectorsForRoom(roomName), sector =>
			makeSectorRadiusFilter(sector, roomName)(deposit.pos.x, deposit.pos.y));
		if (owning !== undefined) {
			context.task(scheduleSector(context.shard, owning, 0, { earliest: true }));
		}
		deposit.room['#removeObject'](deposit);
		context.didUpdate();
	} else {
		context.wakeAt(deposit['#nextDecayTime']);
	}
});
