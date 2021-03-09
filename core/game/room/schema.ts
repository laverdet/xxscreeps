import { compose, declare, member, struct, variant, vector } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import * as Controller from 'xxscreeps/game/objects/structures/controller';
import * as Creep from 'xxscreeps/game/objects/creep';
import * as Extension from 'xxscreeps/game/objects/structures/extension';
import * as Road from 'xxscreeps/game/objects/structures/road';
import * as Spawn from 'xxscreeps/game/objects/structures/spawn';
import * as Storage from 'xxscreeps/game/objects/structures/storage';
import * as Tower from 'xxscreeps/game/objects/structures/tower';
import { EventLogSymbol } from './event-log';

// Schema definition
export const format = () => compose(shape, Room);
export function shape() {
	return declare('Room', struct({
		...structForPath('Room'),
		name: 'string',
		_objects: vector(variant(
			...variantForPath('Room.objects'),
			Controller.format,
			Creep.format,
			Extension.format,
			Road.format,
			Spawn.format,
			Storage.format,
			Tower.format,
		)),
		eventLog: member(EventLogSymbol,
			vector(variant(...variantForPath('Room.eventLog')))),
	}));
}
