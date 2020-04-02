import { bindInterceptors, makeVariant, makeVector, withSymbol } from '~/lib/schema';
import { Objects, Room } from '~/game/room';

import * as Controller from './controller';
import * as ConstructionSite from './construction-site';
import * as Creep from './creep';
import * as Extension from './extension';
import * as Source from './source';
import * as Spawn from './spawn';

export const shape = bindInterceptors('Room', {
	name: 'string',
	objects: makeVector(makeVariant(
		ConstructionSite.format,
		Controller.format,
		Creep.format,
		Extension.format,
		Source.format,
		Spawn.format,
	)),
}, {
	members: {
		objects: withSymbol(Objects),
	},
});

export const format = bindInterceptors(shape, { overlay: Room });
