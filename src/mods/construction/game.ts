import C from 'xxscreeps/game/constants';
import * as ConstructionSite from './construction-site';
import * as Id from 'xxscreeps/engine/schema/id';
import { constant, struct, variant } from 'xxscreeps/schema';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';
import { hooks, registerGlobal } from 'xxscreeps/game';
import './creep';
import './position';
import './room';

// Add `constructionSites` to global `game` object
declare module 'xxscreeps/game/game' {
	interface Game {
		constructionSites: Record<string, ConstructionSite.ConstructionSite>;
	}
}
hooks.register('gameInitializer', Game => Game.constructionSites = Object.create(null));

// Export `ConstructionSite` to runtime globals
registerGlobal(ConstructionSite.ConstructionSite);
declare module 'xxscreeps/game/runtime' {
	interface Global { ConstructionSite: typeof ConstructionSite.ConstructionSite }
}

// Schema types
const actionSchema = registerEnumerated('ActionLog.action', 'build', 'repair');
declare module 'xxscreeps/game/object' {
	interface Schema { construction: typeof actionSchema }
}

const siteSchema = registerVariant('Room.objects', ConstructionSite.format);

const buildEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_BUILD),
	event: constant(C.EVENT_BUILD),
	targetId: Id.format,
	amount: 'int32',
	energySpent: 'int32',
}));
const repairEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_REPAIR),
	event: constant(C.EVENT_REPAIR),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
	energySpent: 'int32',
}));

declare module 'xxscreeps/game/room' {
	interface Schema { construction: [ typeof siteSchema, typeof buildEventSchema, typeof repairEventSchema ] }
}
