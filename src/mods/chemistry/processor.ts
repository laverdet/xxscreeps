import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { Creep, calculateCarry } from 'xxscreeps/mods/creep/creep.js';
import { drop as dropResource } from 'xxscreeps/mods/resource/processor/resource.js';
import { StructureLab, calcTotalReactionsTime, checkBoostCreep, checkReverseReaction, checkRunReaction, checkUnboostCreep, getReactionProduct, getReactionVariants } from './lab.js';

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

	registerIntentProcessor(StructureLab, 'reverseReaction', {}, (lab, context, id1: string, id2: string) => {
		const lab1 = Game.getObjectById<StructureLab>(id1)!;
		const lab2 = Game.getObjectById<StructureLab>(id2)!;
		if (checkReverseReaction(lab, lab1, lab2) !== C.OK) {
			return;
		}
		const mineralType = lab.mineralType!;
		const variants = getReactionVariants(mineralType);
		const variant = variants.find(v =>
			(!lab1.mineralType || lab1.mineralType === v[0]) &&
			(!lab2.mineralType || lab2.mineralType === v[1]))!;

		lab.store['#subtract'](mineralType, C.LAB_REACTION_AMOUNT);
		lab1.store['#add'](variant[0], C.LAB_REACTION_AMOUNT);
		lab2.store['#add'](variant[1], C.LAB_REACTION_AMOUNT);
		lab['#cooldownTime'] = Game.time + C.REACTION_TIME[mineralType as keyof typeof C.REACTION_TIME];
		context.didUpdate();
	}),

	registerIntentProcessor(StructureLab, 'unboostCreep', {}, (lab, context, creepId: string) => {
		const creep = Game.getObjectById<Creep>(creepId)!;
		if (checkUnboostCreep(lab, creep) !== C.OK) {
			return;
		}

		// Count boosted parts by boost type
		const boostedParts: Record<string, number> = {};
		for (const part of creep.body) {
			if (part.boost) {
				boostedParts[part.boost] = (boostedParts[part.boost] ?? 0) + 1;
			}
		}

		// Strip all boosts
		for (const part of creep.body) {
			part.boost = undefined;
		}

		// Recalculate carry capacity
		creep.store['#capacity'] = calculateCarry(creep.body);

		// Drop resources and calculate cooldown
		let cooldown = 0;
		for (const resource of C.RESOURCES_ALL) {
			const count = boostedParts[resource];
			if (!count) continue;

			const mineralReturn = count * C.LAB_UNBOOST_MINERAL;
			if (mineralReturn > 0) {
				dropResource(creep.pos, resource, mineralReturn);
			}

			cooldown += count * calcTotalReactionsTime(resource) * C.LAB_UNBOOST_MINERAL / C.LAB_REACTION_AMOUNT;
		}

		if (cooldown > 0) {
			lab['#cooldownTime'] = Game.time + cooldown;
		}

		context.didUpdate();
	}),
];
