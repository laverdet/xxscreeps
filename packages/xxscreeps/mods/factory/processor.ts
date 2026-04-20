import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { StructureFactory, checkProduce, getCommodityRecipe } from './factory.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { factory: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureFactory, 'produce', {}, (factory, context, resourceType: ResourceType) => {
		if (checkProduce(factory, resourceType) !== C.OK) {
			return;
		}
		const recipe = getCommodityRecipe(resourceType)!;
		for (const [ component, amount ] of Object.entries(recipe.components)) {
			factory.store['#subtract'](component as ResourceType, amount);
		}
		factory.store['#add'](resourceType, recipe.amount);
		factory['#cooldownTime'] = Game.time + recipe.cooldown - 1;
		saveAction(factory, 'produce', factory.pos);
		context.didUpdate();
	}),
];
