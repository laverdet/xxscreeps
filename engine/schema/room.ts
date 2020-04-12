import { declare, getReader, getWriter, variant, vector, TypeOf } from '~/lib/schema';
import { Room } from '~/game/room';

import * as Container from './container';
import * as Controller from './controller';
import * as ConstructionSite from './construction-site';
import * as Creep from './creep';
import * as Extension from './extension';
import * as Resource from './resource';
import * as Road from './road';
import * as Source from './source';
import * as Spawn from './spawn';
import * as Storage from './storage';
import * as Tower from './tower';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Room', {
	name: 'string',
	_objects: vector(variant(
		Container.format,
		ConstructionSite.format,
		Controller.format,
		Creep.format,
		Extension.format,
		Resource.format,
		Road.format,
		Source.format,
		Spawn.format,
		Storage.format,
		Tower.format,
	)),
});

export const format = declare(shape, { overlay: Room });

export const read = getReader(format);
export const write = getWriter(format);
