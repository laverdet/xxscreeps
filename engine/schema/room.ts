import { declare, getReader, getWriter, variant, vector, withSymbol } from '~/lib/schema';
import { Objects, Room } from '~/game/room';

import * as Controller from './controller';
import * as ConstructionSite from './construction-site';
import * as Creep from './creep';
import * as Extension from './extension';
import * as Source from './source';
import * as Spawn from './spawn';

export const shape = declare('Room', {
	name: 'string',
	objects: withSymbol(Objects, vector(variant(
		ConstructionSite.format,
		Controller.format,
		Creep.format,
		Extension.format,
		Source.format,
		Spawn.format,
	))),
});

export const format = declare(shape, { overlay: Room });

export const read = getReader(format);
export const write = getWriter(format);
