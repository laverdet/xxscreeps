import type { DepositResource } from './main.js';
import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { calculatePower } from 'xxscreeps/mods/classic/creep/creep.js';
import { registerHarvestProcessor } from 'xxscreeps/mods/classic/harvestable/processor.js';
import * as Resource from 'xxscreeps/mods/classic/resource/processor/resource.js';
import { makeSectorRadiusPredicate } from 'xxscreeps/mods/modern/sector/sector.js';
import { shuffledSquare } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';
import { Deposit } from './deposit.js';
import { scheduleSector } from './model.js';

// The first wall position in 5..44, in random order, with at least one non-wall neighbor (incl.
// diagonals), inside the sector's 250-square radius, and 2 squares clear of any other room object.
function findPlacement(world: World, centralRoom: string, targetRoom: RoomClass) {
	const { terrain, sectors } = world.map['#getRoomTraits'](targetRoom.name);
	const objects = targetRoom['#objects'];
	const inSector = makeSectorRadiusPredicate(centralRoom, targetRoom.name, sectors);
	return Fn.pipe(
		shuffledSquare(5, 40),
		$$ => Fn.filter($$, ([ xx, yy ]) => terrain.get(xx, yy) === C.TERRAIN_MASK_WALL),
		// Divergence from the official cron, which computes this check but never enforces it.
		$$ => Fn.filter($$, ([ xx, yy ]) => inSector(xx, yy)),
		$$ => Fn.map($$, ([ xx, yy ]) => new RoomPosition(xx, yy, targetRoom.name)),
		$$ => Fn.filter($$, from => Fn.some(iterateNeighbors(from), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL)),
		$$ => Fn.reject($$, from => Fn.some(objects, object => object.pos.getRangeTo(from) <= 2)),
		$$ => Fn.first($$));
}

registerHarvestProcessor(Deposit, (creep, deposit) => {
	const amount = calculatePower(creep, C.WORK, C.HARVEST_DEPOSIT_POWER, 'harvest');
	const overflow = Math.max(amount - creep.store.getFreeCapacity(deposit.depositType), 0);
	creep.store['#add'](deposit.depositType, amount - overflow);
	if (overflow > 0) {
		Resource.drop(creep.pos, deposit.depositType, overflow);
	}
	deposit['#harvested'] += amount;
	const cooldown = Math.ceil(C.DEPOSIT_EXHAUST_MULTIPLY * deposit['#harvested'] ** C.DEPOSIT_EXHAUST_POW);
	deposit.lastCooldown = cooldown;
	if (cooldown > 1) {
		deposit['#cooldownTime'] = Game.time + cooldown - 1;
	}
	deposit['#nextDecayTime'] = Game.time + C.DEPOSIT_DECAY_TIME;
	return amount;
});

registerObjectTickProcessor(Deposit, (deposit, context) => {
	if (deposit.ticksToDecay === 0) {
		// Decay just freed throughput in the owning sector — of the 1–4 candidate sectors for
		// this room, the one whose 250-square radius contains the position. Score 0 = due
		// immediately; the evaluator excludes deposits at their decay tick from the tally, so
		// the same-tick re-eval already sees this one gone.
		const { roomName } = deposit.pos;
		const { sectors } = context.state.world.map['#getRoomTraits'](roomName);
		const owning =
			sectors.find(sectorName => makeSectorRadiusPredicate(sectorName, roomName, sectors)(deposit.pos.x, deposit.pos.y));
		if (owning !== undefined) {
			context.task(scheduleSector(context.shard, owning, 0, { earliest: true }));
		}
		deposit.room['#removeObject'](deposit);
		context.didUpdate();
	} else {
		context.wakeAt(deposit['#nextDecayTime']);
	}
});

// Placement runs at the room intent stage so it can read terrain via the live `world.map`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const placeDepositIntent = registerIntentProcessor(
	RoomClass, 'placeDeposit', { internal: true },
	(room, context, depositType: DepositResource, centralRoom: string) => {
		const pos = findPlacement(context.state.world, centralRoom, room);
		if (pos === undefined) {
			return;
		}
		const deposit = createRoomObject(new Deposit(), pos);
		deposit.depositType = depositType;
		deposit['#nextDecayTime'] = Game.time + C.DEPOSIT_DECAY_TIME;
		room['#insertObject'](deposit);
		context.didUpdate();
		context.wakeAt(deposit['#nextDecayTime']);
	});
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { deposit: typeof placeDepositIntent }
}
