import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { ConstructionSite } from './construction-site.js';
import { constructionSiteShape } from './schema.js';
import './creep.js';
import './position.js';
import './room.js';

// Add `constructionSites` to global `game` object
hooks.register('gameInitializer', Game => Game.constructionSites = Object.create(null));

// Export `ConstructionSite` to runtime globals
registerGlobal(ConstructionSite);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const siteSchema = registerVariant('Room.objects', compose(constructionSiteShape, ConstructionSite));

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A hash containing all your construction sites with their id as hash keys.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.constructionSites
		 */
		constructionSites: Record<string, ConstructionSite>;
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global { ConstructionSite: typeof ConstructionSite }
}

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { construction: [ typeof siteSchema ] }
}
