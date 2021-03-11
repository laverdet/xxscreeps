import * as C from 'xxscreeps/game/constants';
import * as ConstructionSite from './construction-site';
import * as Id from 'xxscreeps/engine/schema/id';
import { constant, struct, variant } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';
import { registerGameInitializer } from 'xxscreeps/game';
import './creep';
import './position';
import './room';


// Add `constructionSites` to global `game` object
declare module 'xxscreeps/game' {
	interface Game {
		constructionSites: Record<string, ConstructionSite.ConstructionSite>;
	}
}
registerGameInitializer(game => game.constructionSites = Object.create(null));

// Schema types
declare module 'xxscreeps/engine/schema' {
	interface Schema { construction: typeof schema }
}
const schema = [
	registerSchema('Room.objects', ConstructionSite.format),

	registerSchema('Room.eventLog', struct({
		...variant(C.EVENT_BUILD),
		event: constant(C.EVENT_BUILD),
		targetId: Id.format,
		amount: 'int32',
		energySpent: 'int32',
	})),
];
