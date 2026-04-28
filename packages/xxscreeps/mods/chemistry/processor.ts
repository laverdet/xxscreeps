import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { Creep, calculateCarry } from 'xxscreeps/mods/creep/creep.js';
import { drop as dropResource } from 'xxscreeps/mods/resource/processor/resource.js';
import { StructureLab, calcTotalReactionsTime, checkBoostCreep, checkReverseReaction, checkRunReaction, checkUnboostCreep, getReactionProduct, getReactionVariants } from './lab.js';

type BoostEffects = Partial<Record<string, number>>;
type BoostsLookup = Partial<Record<string, Partial<Record<string, BoostEffects>>>>;
type ReactionTimeLookup = Partial<Record<string, number>>;

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { chemistry: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureLab, 'runReaction', {}, (lab, context, id1: string, id2: string) => {
		const left = Game.getObjectById<StructureLab>(id1)!;
		const right = Game.getObjectById<StructureLab>(id2)!;
		if (checkRunReaction(lab, left, right) !== C.OK) {
			return;
		}

		const product = getReactionProduct(left.mineralType!, right.mineralType!)!;
		const reactionTime: ReactionTimeLookup = C.REACTION_TIME;

		lab.store['#add'](product, C.LAB_REACTION_AMOUNT);
		left.store['#subtract'](left.mineralType!, C.LAB_REACTION_AMOUNT);
		right.store['#subtract'](right.mineralType!, C.LAB_REACTION_AMOUNT);
		lab['#cooldownTime'] = Game.time + reactionTime[product]! - 1;
		saveAction(lab, 'reaction1', left.pos);
		saveAction(lab, 'reaction2', right.pos);
		context.didUpdate();
	}),

	registerIntentProcessor(StructureLab, 'boostCreep', {}, (lab, context, creepId: string, bodyPartsCount: number) => {
		const creep = Game.getObjectById<Creep>(creepId)!;
		if (checkBoostCreep(lab, creep, bodyPartsCount || undefined) !== C.OK) {
			return;
		}
		const mineralType = lab.mineralType!;

		// Find non-boosted parts matching this mineral's boost type
		const boosts: BoostsLookup = C.BOOSTS;
		let nonBoostedParts = creep.body.filter(
			part => !part.boost && boosts[part.type]?.[mineralType]);

		// TOUGH parts boosted first (ascending index), all others last-to-first (reversed)
		if (nonBoostedParts.length > 0 && nonBoostedParts[0].type !== C.TOUGH) {
			nonBoostedParts = [ ...nonBoostedParts ].reverse();
		}

		if (bodyPartsCount) {
			nonBoostedParts = nonBoostedParts.slice(0, bodyPartsCount);
		}

		// Apply boosts while resources allow
		for (const ii of Fn.range(nonBoostedParts.length)) {
			if (lab.store[C.RESOURCE_ENERGY] < C.LAB_BOOST_ENERGY || lab.store[mineralType] < C.LAB_BOOST_MINERAL) {
				break;
			}
			nonBoostedParts[ii].boost = mineralType;
			lab.store['#subtract'](mineralType, C.LAB_BOOST_MINERAL);
			lab.store['#subtract'](C.RESOURCE_ENERGY, C.LAB_BOOST_ENERGY);
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
		const variant = variants.find(variant =>
			(!lab1.mineralType || lab1.mineralType === variant[0]) &&
			(!lab2.mineralType || lab2.mineralType === variant[1]))!;

		lab.store['#subtract'](mineralType, C.LAB_REACTION_AMOUNT);
		lab1.store['#add'](variant[0], C.LAB_REACTION_AMOUNT);
		lab2.store['#add'](variant[1], C.LAB_REACTION_AMOUNT);
		const reactionTime: ReactionTimeLookup = C.REACTION_TIME;
		lab['#cooldownTime'] = Game.time + reactionTime[mineralType]! - 1;
		saveAction(lab, 'reverseReaction1', lab1.pos);
		saveAction(lab, 'reverseReaction2', lab2.pos);
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
			delete part.boost;
		}

		// Recalculate carry capacity
		creep.store['#capacity'] = calculateCarry(creep.body);

		// Drop resources and calculate cooldown
		let cooldown = 0;
		for (const resource of C.RESOURCES_ALL) {
			const count = boostedParts[resource];
			if (!count) continue;

			const energyReturn = count * C.LAB_UNBOOST_ENERGY;
			if (energyReturn > 0) {
				dropResource(creep.pos, C.RESOURCE_ENERGY, energyReturn);
			}
			const mineralReturn = count * C.LAB_UNBOOST_MINERAL;
			if (mineralReturn > 0) {
				dropResource(creep.pos, resource, mineralReturn);
			}

			cooldown += count * calcTotalReactionsTime(resource) * C.LAB_UNBOOST_MINERAL / C.LAB_REACTION_AMOUNT;
		}

		if (cooldown > 0) {
			lab['#cooldownTime'] = Game.time + cooldown - 1;
		}

		context.didUpdate();
	}),
];
