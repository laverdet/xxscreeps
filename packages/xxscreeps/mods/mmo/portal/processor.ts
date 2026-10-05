import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { Game } from 'xxscreeps/game/index.js';
import { expiresNextTick } from 'xxscreeps/game/object.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructurePortal, create } from 'xxscreeps/mods/portal/portal.js';
import * as C from 'xxscreeps:mods/constants';
import { requestSweep } from './model.js';

registerObjectTickProcessor(StructurePortal, (portal, context, next) => {
	if (expiresNextTick(portal['#decayTime'])) {
		context.task(requestSweep(context.shard));
	}
	next();
});

export type PortalIntents = typeof intents;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	// Places the eight portal structures around `placement`. Each one leads to the structure at the same offset around
	// `partner`, which leads back. Main chooses both positions because each portal needs to know where the other is.
	registerIntentProcessor(
		Room, 'placePortalRing', { internal: true },
		(room, context, placementId: number, partnerId: number, unstableTime: number) => {
			const placement = RoomPosition['#create'](placementId);
			const partner = RoomPosition['#create'](partnerId);
			for (const pos of iterateNeighbors(placement)) {
				const portal = create(pos, new RoomPosition(partner.x + pos.x - placement.x, partner.y + pos.y - placement.y, partner.roomName));
				portal['#unstableTime'] = unstableTime;
				room['#insertObject'](portal);
			}
			context.didUpdate();
		}),

	// Starts decay on every stable portal in the room. Main sends this to both rooms of a pair in the same sweep so that
	// they disappear on the same tick.
	registerIntentProcessor(
		Room, 'destabilizePortalRing', { internal: true },
		(room, context) => {
			const portals = Fn.filter(room['#objects'], instanceOfPredicate(StructurePortal));
			for (const portal of Fn.filter(portals, portal => portal['#unstableTime'] !== 0)) {
				portal['#decayTime'] = Game.time + C.PORTAL_DECAY;
				portal['#unstableTime'] = 0;
			}
			context.didUpdate();
		}),
];
