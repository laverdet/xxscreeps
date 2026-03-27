import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { Creep, calculateCarry } from 'xxscreeps/mods/creep/creep.js';
import { StructureLab, checkBoostCreep, checkRunReaction, getReactionProduct } from './lab.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { chemistry: typeof intents }
}
const intents = [
	registerIntentProcessor(StructureLab, 'runReaction', {}, (lab, context, id1: string, id2: string) => {
		const left = Game.getObjectById<StructureLab>(id1)!;
		const right = Game.getObjectById<StructureLab>(id2)!;
		if (checkRunReaction(lab, left, right) === C.OK) {
			const product = getReactionProduct(left.mineralType, right.mineralType)!;
			lab.store['#add'](product, C.LAB_REACTION_AMOUNT);
			left.store['#subtract'](left.mineralType!, C.LAB_REACTION_AMOUNT);
			right.store['#subtract'](right.mineralType!, C.LAB_REACTION_AMOUNT);
			lab['#cooldownTime'] = Game.time + C.REACTION_TIME[product as keyof typeof C.REACTION_TIME];
			saveAction(lab, 'reaction1', left.pos);
			saveAction(lab, 'reaction2', left.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureLab, 'boostCreep', {}, (lab, context, creepId: string, bodyPartsCount: number) => {
		const creep = Game.getObjectById<Creep>(creepId)!;
		if (checkBoostCreep(lab, creep, bodyPartsCount || undefined) !== C.OK) {
			return;
		}
		const mineralType = lab.mineralType!;

		// Find non-boosted parts matching this mineral's boost type
		let nonBoostedParts = creep.body.filter(
			p => !p.boost && (C.BOOSTS as any)[p.type]?.[mineralType]);

		// TOUGH parts boosted first (ascending index), all others last-to-first (reversed)
		if (nonBoostedParts.length > 0 && nonBoostedParts[0].type !== C.TOUGH) {
			nonBoostedParts = [ ...nonBoostedParts ].reverse();
		}

		if (bodyPartsCount) {
			nonBoostedParts = nonBoostedParts.slice(0, bodyPartsCount);
		}

		// Apply boosts while resources allow
		while (
			lab.store[C.RESOURCE_ENERGY] >= C.LAB_BOOST_ENERGY &&
			(lab.store as any)[mineralType] >= C.LAB_BOOST_MINERAL &&
			nonBoostedParts.length
		) {
			nonBoostedParts[0].boost = mineralType;
			lab.store['#subtract'](mineralType, C.LAB_BOOST_MINERAL);
			lab.store['#subtract'](C.RESOURCE_ENERGY, C.LAB_BOOST_ENERGY);
			nonBoostedParts.splice(0, 1);
		}

		// Recalculate carry capacity in case CARRY parts were boosted
		creep.store['#capacity'] = calculateCarry(creep.body);

		saveAction(creep, 'healed', lab.pos);
		context.didUpdate();
	}),
];
