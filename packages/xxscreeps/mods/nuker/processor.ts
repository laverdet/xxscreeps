import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { ConstructionSite } from 'xxscreeps/mods/construction/construction-site.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { Tombstone } from 'xxscreeps/mods/creep/tombstone.js';
import { StructureRampart } from 'xxscreeps/mods/defense/rampart.js';
import { Resource } from 'xxscreeps/mods/resource/resource.js';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { Ruin } from 'xxscreeps/mods/structure/ruin.js';
import { Structure } from 'xxscreeps/mods/structure/structure.js';
import { create as createNuke, Nuke } from './nuke.js';
import { StructureNuker, checkLaunchNuke } from './nuker.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { nuker: typeof intents }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureNuker, 'launchNuke', {}, (nuker, context, roomName: string, x: number, y: number) => {
		const target = new RoomPosition(x, y, roomName);
		if (checkLaunchNuke(nuker, target) !== C.OK) return;

		const energyCapacity = nuker.store.getCapacity(C.RESOURCE_ENERGY) ?? 0;
		const ghodiumCapacity = nuker.store.getCapacity(C.RESOURCE_GHODIUM) ?? 0;
		nuker.store['#subtract'](C.RESOURCE_ENERGY, energyCapacity);
		nuker.store['#subtract'](C.RESOURCE_GHODIUM, ghodiumCapacity);
		nuker['#cooldownTime'] = Game.time + C.NUKER_COOLDOWN - 1;

		context.sendRoomIntent(roomName, 'nukeArrive',
			x, y, nuker.room.name, Game.time + C.NUKE_LAND_TIME);

		// TODO: notify the launching player (`Game.notify`); requires processor-side
		// notification queueing once a shard tick processor lands.
		context.didUpdate();
	}),

	registerIntentProcessor(Room, 'nukeArrive', { internal: true }, (room, context, x: number, y: number, launchRoomName: string, landTime: number) => {
		const nuke = createNuke(new RoomPosition(x, y, room.name), launchRoomName, landTime);
		room['#insertObject'](nuke);
		context.setActive();
	}),
];

registerObjectTickProcessor(Nuke, (nuke, context) => {
	const landTime = nuke['#landTime'];
	if (Game.time === landTime - 1) {
		applyNukeImpact(nuke, context);
		context.didUpdate();
		context.wakeAt(landTime);
	} else if (Game.time >= landTime) {
		nuke.room['#removeObject'](nuke);
		context.didUpdate();
	} else {
		context.wakeAt(landTime - 1);
	}
});

function applyNukeImpact(nuke: Nuke, context: ProcessorContext) {
	const room = nuke.room;
	const removed = new Set<unknown>();

	// Room-wide cleanup: kill creeps, zero powerCreeps, remove transient objects, cancel spawning.
	// Iterate over a snapshot since `#removeObject` queues but doesn't immediately mutate.
	for (const object of [ ...room['#objects'] ]) {
		if (object instanceof Creep) {
			appendEventLog(room, {
				event: C.EVENT_OBJECT_DESTROYED,
				objectId: object.id,
				type: 'creep',
			});
			room['#removeObject'](object);
			removed.add(object);
		} else if (
			object instanceof ConstructionSite ||
			object instanceof Resource ||
			object instanceof Tombstone ||
			object instanceof Ruin
		) {
			room['#removeObject'](object);
			removed.add(object);
		} else if (object instanceof StructureSpawn && object.spawning) {
			const spawningCreep = Game.getObjectById(object.spawning['#spawningCreepId']);
			if (spawningCreep) {
				room['#removeObject'](spawningCreep);
				removed.add(spawningCreep);
			}
			object.spawning = null;
		}
	}

	// 5x5 blast: rampart on tile absorbs first, residual hits non-rampart structures.
	for (let dx = -2; dx <= 2; ++dx) {
		for (let dy = -2; dy <= 2; ++dy) {
			const tx = nuke.pos.x + dx;
			const ty = nuke.pos.y + dy;
			if (tx < 0 || tx > 49 || ty < 0 || ty > 49) continue;

			const range = Math.max(Math.abs(dx), Math.abs(dy));
			const damage = (range === 0 ? C.NUKE_DAMAGE[0] : C.NUKE_DAMAGE[2])!;

			const tilePos = new RoomPosition(tx, ty, room.name);
			const targets: DamageableStructure[] = [];
			let rampart: StructureRampart | undefined;
			for (const target of room['#lookAt'](tilePos)) {
				if (removed.has(target) || !(target instanceof Structure) || typeof target.hits !== 'number') continue;
				const damageable = target as DamageableStructure;
				targets.push(damageable);
				if (target instanceof StructureRampart && rampart === undefined) {
					rampart = target;
				}
			}

			let residual = damage;
			if (rampart) {
				const rampartHits = rampart.hits;
				applyNukeDamage(nuke, rampart as DamageableStructure, damage, removed);
				residual = damage - rampartHits;
			}
			if (residual > 0) {
				for (const target of targets) {
					if (target === rampart) continue;
					applyNukeDamage(nuke, target, residual, removed);
				}
			}
		}
	}

	// Controller: cancel active safe mode, set upgradeBlocked unless a longer block is already active.
	const controller = room.controller;
	if (controller) {
		if (room['#safeModeUntil'] > Game.time) {
			room['#safeModeUntil'] = Game.time;
			controller['#safeModeCooldownTime'] = 0;
		}
		// TODO: gate on EFFECT_INVULNERABILITY once effects substrate lands.
		if (controller['#user'] !== null) {
			const blockedUntil = controller['#upgradeBlockedUntil'];
			if (blockedUntil === 0 || blockedUntil < Game.time) {
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_NUKE_BLOCKED_UPGRADE;
			}
		}
	}

	void context;
}

type DamageableStructure = Structure & { hits: number };

function applyNukeDamage(nuke: Nuke, target: DamageableStructure, damage: number, removed: Set<unknown>) {
	const room = target.room;
	target.hits -= damage;
	appendEventLog(room, {
		event: C.EVENT_ATTACK,
		objectId: nuke.id,
		targetId: target.id,
		attackType: C.EVENT_ATTACK_TYPE_NUKE,
		damage,
	});
	if (target.hits <= 0) {
		room['#removeObject'](target);
		removed.add(target);
		appendEventLog(room, {
			event: C.EVENT_OBJECT_DESTROYED,
			objectId: target.id,
			type: target.structureType,
		});
	}
}
