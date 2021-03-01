import { compose, declare, struct, variant, vector } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as Container from 'xxscreeps/game/objects/structures/container';
import * as Controller from 'xxscreeps/game/objects/structures//controller';
import * as ConstructionSite from 'xxscreeps/game/objects/construction-site';
import * as Creep from 'xxscreeps/game/objects/creep';
import * as Extension from 'xxscreeps/game/objects/structures//extension';
import * as Resource from 'xxscreeps/game/objects/resource';
import * as Road from 'xxscreeps/game/objects/structures//road';
import * as Spawn from 'xxscreeps/game/objects/structures//spawn';
import * as Storage from 'xxscreeps/game/objects/structures//storage';
import * as Tower from 'xxscreeps/game/objects/structures//tower';
import { mapInPlace } from 'xxscreeps/util/utility';
import { objectFormats } from './schema-hook';

// Schema definition
export function format() { return compose(shape, Room) }
export function shape() {
	return declare('Room', struct({
		name: 'string',
		_npcs: compose(vector(Id.format), {
			compose: value => new Set(value),
			decompose: (value: Set<string>) => value.values(),
		}),
		_npcMemory: compose(vector(struct({
			id: Id.format,
			memory: 'buffer',
		})), {
			compose: values => new Map(values.map(value => [ value.id, value.memory ])),
			decompose: (map: Map<string, Readonly<Uint8Array>>) => mapInPlace(map, ([ id, memory ]) => ({ id, memory })),
		}),
		_objects: vector(variant(
			...objectFormats,
			Container.format,
			ConstructionSite.format,
			Controller.format,
			Creep.format,
			Extension.format,
			Resource.format,
			Road.format,
			Spawn.format,
			Storage.format,
			Tower.format,
		)),
	}));
}
