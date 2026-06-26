import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { Resource, ResourceType } from 'xxscreeps/mods/resource/resource.js';
import type { WithStore } from 'xxscreeps/mods/resource/store.js';
import type { Structure } from 'xxscreeps/mods/structure/structure.js';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as Movement from 'xxscreeps/engine/processor/movement.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { ALL_DIRECTIONS } from 'xxscreeps/game/direction.js';
import { Game } from 'xxscreeps/game/index.js';
import { create as createObject, saveAction } from 'xxscreeps/game/object.js';
import { makePositionChecker } from 'xxscreeps/game/pathfinder/obstacle.js';
import { getPositionInDirection } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { checkCarrier, checkDrop, checkPickup, checkTransfer, checkWithdraw } from 'xxscreeps/mods/creep/creep.js';
import { flushActionLog } from 'xxscreeps/mods/creep/processor.js';
import { Tombstone } from 'xxscreeps/mods/creep/tombstone.js';
import { StructurePowerBank } from 'xxscreeps/mods/powerbank/powerbank.js';
import { StructurePowerSpawn } from 'xxscreeps/mods/powerspawn/powerspawn.js';
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource.js';
import { OpenStore } from 'xxscreeps/mods/resource/store.js';
import { checkMyStructure } from 'xxscreeps/mods/structure/structure.js';
import * as Model from './model.js';
import { PowerCreep, createSpawnedPowerCreep } from './powercreep.js';

// Leave a tombstone where a power creep died and drop whatever it was carrying. Power creeps have no
// body, so the corpse only holds the store; the tombstone decays on the power-creep timer.
function buryPowerCreep(creep: PowerCreep) {
	const tombstone = createObject(new Tombstone(), creep.pos);
	tombstone.deathTime = Game.time;
	tombstone.store = new OpenStore();
	for (const [ resourceType, amount ] of creep.store['#entries']()) {
		tombstone.store['#add'](resourceType, amount);
	}
	tombstone['#creep'] = {
		body: [],
		id: creep.id,
		name: creep.name,
		saying: creep['#saying'],
		ticksToLive: creep.ticksToLive ?? 0,
		user: creep['#user'],
	};
	tombstone['#decayTime'] = Game.time + C.TOMBSTONE_DECAY_POWER_CREEP;
	creep.room['#insertObject'](tombstone);
	appendEventLog(creep.room, { event: C.EVENT_OBJECT_DESTROYED, objectId: creep.id, type: 'powerCreep' });
	creep.room['#removeObject'](creep);
}

// Death frees the roster slot and starts the wall-clock respawn cooldown. The roster lives in account
// keyspace, so the writeback rides `context.task` — the same path the GPL/GCL credit uses.
function killPowerCreep(creep: PowerCreep, context: ProcessorContext) {
	const user = creep['#user'];
	const id = creep.id;
	buryPowerCreep(creep);
	context.task(Model.setSpawnCooldown(context.shard.db, user, id, Date.now() + C.POWER_CREEP_SPAWN_COOLDOWN));
	context.setActive();
}

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { powerCreep: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	// A power spawn materializes a roster member next to it. The runtime carries the creep's identity
	// and powers in the intent; the processor derives hits/store/lifetime and inserts the room object.
	registerIntentProcessor(StructurePowerSpawn, 'spawnPowerCreep', {}, (
		spawn, context, id: string, name: string, className: string, powers: [ number, number ][],
	) => {
		if (checkMyStructure(spawn, StructurePowerSpawn) !== C.OK) {
			return;
		}
		const user = spawn['#user']!;
		const check = makePositionChecker({ checkTerrain: true, room: spawn.room, user });
		const pos = ALL_DIRECTIONS
			.map(direction => getPositionInDirection(spawn.pos, direction))
			.find(candidate => candidate !== undefined && check(candidate));
		if (pos === undefined) {
			return;
		}
		// The runtime's `spawn()` cooldown check reads the roster blob, which lags a death's cooldown
		// writeback by a tick or two; re-read the authoritative cooldown here so a respawn can't slip
		// through that window.
		context.task(Model.getSpawnCooldown(context.shard.db, user, id), cooldownTime => {
			if (cooldownTime === undefined || cooldownTime <= Date.now()) {
				spawn.room['#insertObject'](createSpawnedPowerCreep(pos, user, id, name, className, powers));
				context.didUpdate();
			}
		});
	}),

	registerIntentProcessor(PowerCreep, 'drop', { before: 'transfer' }, (creep, context, resourceType: ResourceType, amount: number) => {
		if (checkDrop(creep, resourceType, amount) === C.OK) {
			creep.store['#subtract'](resourceType, amount);
			ResourceIntent.drop(creep.pos, resourceType, amount);
			context.didUpdate();
		}
	}),

	// Fatigue-free movement: no body, no weight, no pull chains. A single move request resolves through
	// the shared movement arbiter at a fixed priority.
	registerIntentProcessor(PowerCreep, 'move', {}, (creep, context, direction: Direction) => {
		if (checkCarrier(creep) === C.OK) {
			Movement.announce(creep, direction, commit => commit(1, pos => {
				creep.room['#moveObject'](creep, pos);
				context.didUpdate();
			}));
		}
	}),

	registerIntentProcessor(PowerCreep, 'pickup', {}, (creep, context, id: string) => {
		const resource = Game.getObjectById<Resource>(id)!;
		if (checkPickup(creep, resource) === C.OK) {
			const amount = Math.min(creep.store.getFreeCapacity(resource.resourceType), resource.amount);
			creep.store['#add'](resource.resourceType, amount);
			resource.amount -= amount;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(PowerCreep, 'say', {}, (creep, context, message: string, isPublic: boolean) => {
		if (checkCarrier(creep) === C.OK) {
			creep['#saying'] = {
				isPublic,
				message: String(message).substring(0, 10),
				time: Game.time,
			};
			context.didUpdate();
		}
	}),

	registerIntentProcessor(PowerCreep, 'transfer', { before: 'withdraw' }, (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<RoomObject & WithStore>(id)!;
		if (checkTransfer(creep, target, resourceType, amount) === C.OK) {
			creep.store['#subtract'](resourceType, amount);
			target.store['#add'](resourceType, amount);
			appendEventLog(creep.room, {
				event: C.EVENT_TRANSFER,
				objectId: creep.id,
				targetId: target.id,
				resourceType,
				amount,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(PowerCreep, 'withdraw', { before: 'pickup' }, (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<Structure & WithStore>(id)!;
		if (checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			target.store['#subtract'](resourceType, amount);
			creep.store['#add'](resourceType, amount);
			appendEventLog(creep.room, {
				event: C.EVENT_TRANSFER,
				objectId: target.id,
				targetId: creep.id,
				resourceType,
				amount,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(PowerCreep, 'notifyWhenAttacked', {}, (creep, context, enabled: boolean) => {
		if (checkCarrier(creep) === C.OK) {
			creep['#noAttackNotify'] = !enabled;
			context.didUpdate();
		}
	}),

	// Renew at an adjacent power spawn or power bank, resetting the creep to a full lifetime.
	registerIntentProcessor(PowerCreep, 'renew', {}, (creep, context, id: string) => {
		const target = Game.getObjectById<StructurePowerSpawn | StructurePowerBank>(id);
		if (
			creep.my &&
			(target instanceof StructurePowerSpawn || target instanceof StructurePowerBank) &&
			creep.pos.isNearTo(target.pos)
		) {
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
		if (saying.time <= Game.time - 10) {
			creep['#saying'] = undefined;
			context.didUpdate();
		} else {
			context.wakeAt(saying.time + 10);
		}
	}
});

registerObjectTickProcessor(PowerCreep, (creep, context) => {
	// Settle damage accumulated this tick (power creeps have no body to absorb it).
	const damage = creep.tickRawDamage ?? 0;
	if (damage > 0) {
		creep.hits = Math.max(0, creep.hits - damage);
		creep.tickRawDamage = 0;
		context.didUpdate();
	}
	if (creep.ticksToLive === 0 || creep.hits <= 0) {
		killPowerCreep(creep, context);
	} else {
		context.wakeAt(creep['#ageTime']);
	}
});
