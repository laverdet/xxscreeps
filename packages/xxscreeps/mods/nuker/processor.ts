import { hooks, registerIntentProcessor, registerObjectTickProcessor, registerObjectWakeField } from 'xxscreeps/engine/processor/index.js';
import { invertedNumericComparator, mappedComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition, positionsInRangeTo } from 'xxscreeps/game/position.js';
import { walkLayers } from 'xxscreeps/game/processor.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { Nuke, create as createNuke } from './nuke.js';
import { StructureNuker, checkLaunchNuke } from './nuker.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { nuker: typeof intents }
}
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		'#applyNukeImpact'(nuke: RoomObject): void;
	}
}

RoomObject.prototype['#applyNukeImpact'] = function() {};

interface NukeImpactState {
	readonly removed: Set<RoomObject>;
	time: number;
}

const nukeImpactState = new Map<Room, NukeImpactState>();
hooks.register('flushContext', () => nukeImpactState.clear());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureNuker, 'launchNuke', {}, (nuker, context, targetPosId: number) => {
		const target = RoomPosition['#create'](targetPosId);
		if (checkLaunchNuke(nuker, target) !== C.OK) return;

		const energyCapacity = C.NUKER_ENERGY_CAPACITY;
		const ghodiumCapacity = C.NUKER_GHODIUM_CAPACITY;
		nuker.store['#subtract'](C.RESOURCE_ENERGY, energyCapacity);
		nuker.store['#subtract'](C.RESOURCE_GHODIUM, ghodiumCapacity);
		nuker['#cooldownTime'] = Game.time + C.NUKER_COOLDOWN;

		context.sendRoomIntent(target.roomName, 'nukeArrive',
			target.x, target.y, nuker.room.name, Game.time + C.NUKE_LAND_TIME);

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

registerObjectWakeField(Nuke, nuke => nuke['#landTime']);

registerObjectTickProcessor(Nuke, (nuke, context) => {
	const { timeToLand } = nuke;
	if (timeToLand === 0) {
		nuke['#landTime'] = 0;
		applyNukeImpact(nuke);
		context.setActive();
	} else if (timeToLand === -1) {
		nuke.room['#removeObject'](nuke);
		context.didUpdate();
	} else {
		context.wakeAt(nuke['#landTime']);
	}
});

function applyNukeImpact(nuke: Nuke) {
	const { room } = nuke;

	// Apply immediate destruction of creeps, resources, and others
	for (const object of room['#immediateObjects']()) {
		object['#applyNukeImpact'](nuke);
	}

	// 5x5 blast: rampart on tile absorbs first, residual hits non-rampart structures.
	for (const pos of positionsInRangeTo(nuke.pos, 2)) {
		const damage = C.NUKE_DAMAGE[nuke.pos.getRangeTo(pos)] ?? 0;
		const objects = Fn.pipe(
			nuke.room['#lookAt'](pos),
			$$ => Fn.reject($$, object =>
				object['#layer'] === undefined || object.hits === undefined),
			$$ => [ ...$$ ],
			$$ => $$.sort(mappedComparator(invertedNumericComparator, object => object['#layer']!)));
		walkLayers(objects, damage, (object, layerPower) => {
			const remaining = object['#captureDamage'](layerPower, C.EVENT_ATTACK_TYPE_NUKE, nuke);
			const absorbed = layerPower - remaining;
			if (absorbed === 0) {
				object['#applyDamage'](layerPower, C.EVENT_ATTACK_TYPE_NUKE, nuke);
			}
			appendEventLog(room, {
				event: C.EVENT_ATTACK,
				objectId: nuke.id,
				targetId: object.id,
				attackType: C.EVENT_ATTACK_TYPE_NUKE,
				damage,
			});
			return remaining;
		});
	}

	// Controller: cancel active safe mode, set upgradeBlocked unless a longer block is already active.
	const controller = room.controller;
	if (controller) {
		room['#safeModeUntil'] = 0;
		controller['#safeModeCooldownTime'] = 0;
		// TODO: gate on EFFECT_INVULNERABILITY once effects substrate lands.
		if (controller['#user'] !== null) {
			if (controller.upgradeBlocked === undefined) {
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_NUKE_BLOCKED_UPGRADE;
			}
		}
	}
}
