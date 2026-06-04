import * as C from 'xxscreeps/game/constants/index.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { Structure, registerAttackNotification } from 'xxscreeps/mods/structure/structure.js';
import { sendNotification } from './model.js';

interface MaybeNamedStructure extends Structure {
	name?: unknown;
}

function describeTarget(target: Creep | Structure) {
	if (target instanceof Creep) {
		return { label: `creep ${target.name}`, userId: target['#user'] };
	}
	const { name } = target as MaybeNamedStructure;
	const label = target.structureType === C.STRUCTURE_SPAWN && typeof name === 'string'
		? `spawn ${name}`
		: `${target.structureType} #${target.id}`;
	return { label, userId: target['#user'] ?? target.room.controller?.['#user'] };
}

registerAttackNotification((context, target, source) => {
	if (!(target instanceof Creep || target instanceof Structure)) {
		return;
	}
	const { label, userId } = describeTarget(target);
	const sourceUser = source?.['#user'];
	if (
		userId != null
		&& userId !== '2' && userId !== '3'
		&& sourceUser !== userId && sourceUser !== '2' && sourceUser !== '3'
	) {
		context.task(sendNotification(context.shard, userId, 'msg',
			`Your ${label} in room ${target.room.name} is under attack!`));
	}
});
