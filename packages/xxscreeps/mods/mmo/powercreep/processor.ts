import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { Direction } from 'xxscreeps/game/position.js';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as Movement from 'xxscreeps/engine/processor/movement.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject, saveAction } from 'xxscreeps/game/object.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { checkCarrier } from 'xxscreeps/mods/classic/creep/creep.js';
import { borderExitPosition, commitMove, flushActionLog, isHostileInSafeMode, kRetainActionsTime, processDrop, processPickup, processSay, processTransfer, processWithdraw, teleportCreep } from 'xxscreeps/mods/classic/creep/processor.js';
import { Tombstone } from 'xxscreeps/mods/classic/creep/tombstone.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { checkIsActive, checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { StructurePowerBank } from 'xxscreeps/mods/modern/powerbank/powerbank.js';
import { StructurePowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';
import * as C from 'xxscreeps:mods/constants';
import * as Model from './model.js';
import { PowerCreep, checkRenew, createSpawnedPowerCreep } from './powercreep.js';

function buryPowerCreep(creep: PowerCreep) {
	const tombstone = createRoomObject(new Tombstone(), creep.pos);
	tombstone.deathTime = Game.time;
	tombstone.store = new OpenStore();
	for (const [ resourceType, amount ] of creep.store['#entries']()) {
		tombstone.store['#add'](resourceType, amount);
	}
	const saying = creep['#saying'];
	tombstone['#creep'] = {
		body: [],
		id: creep.id,
		name: creep.name,
		saying: saying?.isPublic && saying.time === Game.time ? saying.message : undefined,
		ticksToLive: creep.ticksToLive ?? 0,
		user: creep['#user'],
	};
	tombstone['#decayTime'] = Game.time + C.TOMBSTONE_DECAY_POWER_CREEP;
	creep.room['#insertObject'](tombstone);
	creep['#destroy']();
}

// The roster lives in account keyspace, so the death writeback rides `context.task`.
function killPowerCreep(creep: PowerCreep, context: ProcessorContext) {
	const user = creep['#user'];
	const id = creep.id;
	buryPowerCreep(creep);
	context.task(Model.setSpawnCooldown(context.shard.db, user, id, Date.now() + C.POWER_CREEP_SPAWN_COOLDOWN));
	context.setActive();
}

export type PowerCreepIntents = typeof intents;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	// The intent carries only the roster id; `claimSpawn` validates it against the authoritative
	// roster and returns the stored entry that seeds the room object.
	registerIntentProcessor(StructurePowerSpawn, 'spawnPowerCreep', {}, (spawn, context, id: string) => {
		if (checkMyStructure(spawn, StructurePowerSpawn) !== C.OK || checkIsActive(spawn) !== C.OK) {
			return;
		}
		if (spawn['#spawnTime'] === Game.time) {
			return;
		}
		spawn['#spawnTime'] = Game.time;
		const ageTime = Game.time + C.POWER_CREEP_LIFE_TIME;
		context.task(Model.claimSpawn(context.shard.db, spawn['#user']!, id, ageTime), entry => {
			if (entry) {
				spawn.room['#insertObject'](createSpawnedPowerCreep(spawn.pos, entry));
				context.didUpdate();
			}
		});
	}),

	registerIntentProcessor(PowerCreep, 'drop', { before: 'transfer' }, processDrop),

	registerIntentProcessor(PowerCreep, 'move', {}, (creep, context, direction: Direction) => {
		if (checkCarrier(creep) === C.OK) {
			const priority = 1 + (isHostileInSafeMode(creep) ? -500 : 0);
			Movement.announce(creep, direction, commit => commit(priority, pos => {
				commitMove(creep, pos, C.ROAD_WEAROUT_POWER_CREEP);
				context.didUpdate();
			}));
		}
	}),

	registerIntentProcessor(PowerCreep, 'pickup', {}, processPickup),

	registerIntentProcessor(PowerCreep, 'say', {}, processSay),

	registerIntentProcessor(PowerCreep, 'transfer', { before: 'withdraw' }, processTransfer),

	registerIntentProcessor(PowerCreep, 'withdraw', { before: 'pickup' }, processWithdraw),

	registerIntentProcessor(PowerCreep, 'renew', {}, (creep, context, id: string) => {
		const target = Game.getObjectById<StructurePowerSpawn | StructurePowerBank>(id)!;
		if (checkRenew(creep, target) === C.OK) {
			creep['#ageTime'] = Game.time + C.POWER_CREEP_LIFE_TIME;
			saveAction(creep, 'healed', target.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(PowerCreep, 'suicide', {}, (creep, context) => {
		if (checkCarrier(creep) === C.OK) {
			killPowerCreep(creep, context);
		}
	}),
];

registerObjectPreTickProcessor(PowerCreep, (creep, context) => {
	flushActionLog(creep['#actionLog'], context);
	const saying = creep['#saying'];
	if (saying) {
		if (saying.time <= Game.time - kRetainActionsTime) {
			creep['#saying'] = undefined;
			context.didUpdate();
		} else {
			context.wakeAt(saying.time + kRetainActionsTime);
		}
	}
});

registerObjectTickProcessor(PowerCreep, (creep, context) => {
	// Settle damage deferred by `#applyDamage`
	const damage = creep.tickRawDamage ?? 0;
	if (damage > 0) {
		creep.hits = Math.max(0, creep.hits - damage);
		creep.tickRawDamage = 0;
		context.didUpdate();
	}
	if (creep.ticksToLive === 0 || creep.hits <= 0) {
		killPowerCreep(creep, context);
	} else if (isBorder(creep.pos.x, creep.pos.y)) {
		teleportCreep(creep, borderExitPosition(creep.pos), context);
	} else {
		context.wakeAt(creep['#ageTime']);
	}
});
