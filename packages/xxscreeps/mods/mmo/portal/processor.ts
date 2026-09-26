import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { create } from 'xxscreeps/mods/portal/portal.js';

export type PortalPlacementIntents = [ typeof placePortalRingIntent ];
// Main picks both centres, because a ring's destinations are the partner ring's own positions: each
// portal leads onto the portal at the same offset from the partner's centre, which leads back.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const placePortalRingIntent = registerIntentProcessor(
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
	});
