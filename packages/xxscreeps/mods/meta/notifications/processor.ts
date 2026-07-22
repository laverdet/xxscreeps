import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { OwnedStructure, Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as C from 'xxscreeps:mods/constants';
import { checkCreepNotifyWhenAttacked, checkStructureNotifyWhenAttacked } from './game.js';
import { sendNotification } from './model.js';

function describeTarget(target: Creep | Structure) {
	interface MaybeNamedStructure extends Structure {
		name?: unknown;
	}
	if (target instanceof Creep) {
		return { label: `creep ${target.name}`, userId: target['#user'] };
	}
	const { name } = target satisfies Structure as MaybeNamedStructure;
	const label = target.structureType === C.STRUCTURE_SPAWN && typeof name === 'string'
		? `spawn ${name}`
		: `${target.structureType} #${target.id}`;
	return { label, userId: target['#user'] ?? target.room.controller?.['#user'] };
}

Creep.prototype['#sendAttackNotify'] =
	OwnedStructure.prototype['#sendAttackNotify'] =
		function(this: Creep | OwnedStructure, context, source) {
			if (!this['#noAttackNotify']) {
				const { label, userId } = describeTarget(this);
				const sourceUser = source?.['#user'];
				if (
					userId != null && sourceUser !== userId &&
					userId !== '2' && userId !== '3' &&
					sourceUser !== '2' && sourceUser !== '3'
				) {
					const message = `Your ${label} in room ${this.room.name} is under attack!`;
					context.task(sendNotification(context.shard, userId, 'msg', message));
				}
			}
		};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Creep, 'notifyWhenAttacked', {}, (creep, context, enabled: boolean) => {
		if (checkCreepNotifyWhenAttacked(creep, enabled) === C.OK) {
			creep['#noAttackNotify'] = !enabled;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(OwnedStructure, 'notifyWhenAttacked', {}, (structure, context, notifyWhenAttacked: boolean) => {
		if (checkStructureNotifyWhenAttacked(structure, notifyWhenAttacked) === C.OK) {
			structure['#noAttackNotify'] = !notifyWhenAttacked;
			context.didUpdate();
		}
	}),
];

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { notifications: typeof intents }
}
