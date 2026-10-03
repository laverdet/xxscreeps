import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructurePortal, create } from 'xxscreeps/mods/portal/portal.js';
import * as C from 'xxscreeps:mods/constants';

export type PortalIntents = typeof intents;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	// Main picks both centers, because a ring's destinations are the partner ring's own positions: each
	// portal leads onto the portal at the same offset from the partner's center, which leads back.
	registerIntentProcessor(
		Room, 'placePortalRing', { internal: true },
		(room, context, centerId: number, partnerId: number, unstableTime: number) => {
			const center = RoomPosition['#create'](centerId);
			const partner = RoomPosition['#create'](partnerId);
			for (const pos of iterateNeighbors(center)) {
				const portal = create(pos, new RoomPosition(partner.x + pos.x - center.x, partner.y + pos.y - center.y, partner.roomName));
				portal['#unstableTime'] = unstableTime;
				room['#insertObject'](portal);
			}
			context.didUpdate();
		}),

	// Main has seen the ring's stable window pass on the wall clock. It sends both rings of a pair in
	// the same sweep, so they land on the same tick and share a decay deadline.
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
