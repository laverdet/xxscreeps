import { declare, getReader, getWriter, variant, vector, TypeOf } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import * as Id from 'xxscreeps/engine/util/schema/id';

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
import { mapInPlace } from 'xxscreeps/util/utility';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Room', {
	name: 'string',
	_npcs: declare(vector(Id.format), {
		compose: value => new Set(value),
		decompose: (value: Set<string>) => value.values(),
	}),
	_npcMemory: declare(vector({
		id: Id.format,
		memory: 'buffer',
	}), {
		compose: values => new Map(values.map(value => [ value.id, value.memory ])),
		decompose: (map: Map<string, Readonly<Uint8Array>>) => mapInPlace(map, ([ id, memory ]) => ({ id, memory })),
	}),
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
