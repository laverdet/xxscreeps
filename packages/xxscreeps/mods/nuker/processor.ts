import { hooks, registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructureRampart } from 'xxscreeps/mods/defense/rampart.js';
import { Structure } from 'xxscreeps/mods/structure/structure.js';
import { Nuke, create as createNuke } from './nuke.js';
import { StructureNuker, checkLaunchNuke } from './nuker.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { nuker: typeof intents }
}
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		'#applyNukeImpact'(nuke: RoomObject): boolean;
	}
}

RoomObject.prototype['#applyNukeImpact'] = function(_nuke: RoomObject) { return false; };

type DamageableStructure = Structure & { hits: number };
interface NukeImpactState {
	readonly removed: Set<RoomObject>;
	time: number;
}

const nukeImpactState = new Map<Room, NukeImpactState>();
hooks.register('flushContext', () => nukeImpactState.clear());

function isValidNukeCoordinates(xx: unknown, yy: unknown) {
	return (
		typeof xx === 'number' &&
		typeof yy === 'number' &&
		Number.isInteger(xx) &&
		Number.isInteger(yy) &&
		xx >= 0 &&
		xx <= 49 &&
		yy >= 0 &&
		yy <= 49
	);
}

function isDamageable(target: RoomObject): target is DamageableStructure {
	return target instanceof Structure && typeof target.hits === 'number';
}

function getNukeImpactRemoved(room: Room) {
	const state = nukeImpactState.get(room);
	if (state?.time === Game.time) {
		return state.removed;
	}
	const removed = new Set<RoomObject>();
	nukeImpactState.set(room, { removed, time: Game.time });
	return removed;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureNuker, 'launchNuke', {}, (nuker, context, roomName: string, xx: number, yy: number) => {
		if (!isValidNukeCoordinates(xx, yy) || !context.state.world.map.getRoomStatus(roomName)) return;
		const target = new RoomPosition(xx, yy, roomName);
		if (checkLaunchNuke(nuker, target) !== C.OK) return;

		const energyCapacity = nuker.store.getCapacity(C.RESOURCE_ENERGY) ?? 0;
		const ghodiumCapacity = nuker.store.getCapacity(C.RESOURCE_GHODIUM) ?? 0;
		nuker.store['#subtract'](C.RESOURCE_ENERGY, energyCapacity);
		nuker.store['#subtract'](C.RESOURCE_GHODIUM, ghodiumCapacity);
		nuker['#cooldownTime'] = Game.time + C.NUKER_COOLDOWN - 1;

		context.sendRoomIntent(roomName, 'nukeArrive',
			xx, yy, nuker.room.name, Game.time + C.NUKE_LAND_TIME - 1);

		// TODO: notify the launching player (`Game.notify`); requires processor-side
		// notification queueing once a shard tick processor lands.
		context.didUpdate();
	}),

	registerIntentProcessor(Room, 'nukeArrive', { internal: true }, (room, context, xx: number, yy: number, launchRoomName: string, landTime: number) => {
		const nuke = createNuke(new RoomPosition(xx, yy, room.name), launchRoomName, landTime);
		room['#insertObject'](nuke);
		context.setActive();
	}),
];

registerObjectTickProcessor(Nuke, (nuke, context) => {
	const landTime = nuke['#landTime'];
	if (Game.time === landTime) {
		applyNukeImpact(nuke);
		context.didUpdate();
		context.wakeAt(landTime + 1);
	} else if (Game.time > landTime) {
		nuke.room['#removeObject'](nuke);
		context.didUpdate();
	} else {
		context.wakeAt(landTime);
	}
});

function applyNukeImpact(nuke: Nuke) {
	const room = nuke.room;
	const removed = getNukeImpactRemoved(room);

	// Iterate over a snapshot since `#removeObject` queues but doesn't immediately mutate.
	for (const object of [ ...room['#objects'] ]) {
		if (removed.has(object)) {
			continue;
		}
		if (object['#applyNukeImpact'](nuke)) {
			removed.add(object);
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
				if (removed.has(target) || !isDamageable(target)) continue;
				targets.push(target);
				if (target instanceof StructureRampart && rampart === undefined) {
					rampart = target;
				}
			}

			let residual = damage;
			if (rampart) {
				const rampartHits = rampart.hits;
				applyNukeDamage(nuke, rampart, damage, removed);
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
}

function applyNukeDamage(nuke: Nuke, target: DamageableStructure, damage: number, removed: Set<RoomObject>) {
	const room = target.room;
	target['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_NUKE, nuke);
	if (target.hits <= 0) {
		removed.add(target);
	}
	appendEventLog(room, {
		event: C.EVENT_ATTACK,
		objectId: nuke.id,
		targetId: target.id,
		attackType: C.EVENT_ATTACK_TYPE_NUKE,
		damage,
	});
}
