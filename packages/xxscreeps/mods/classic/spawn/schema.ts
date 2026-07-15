import type { Spawning } from './spawn.js';
import type { Direction } from 'xxscreeps/game/position.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeSingleStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { composeBind, declare, optional, struct, variant, vector, withType } from 'xxscreeps/schema/index.js';

/** @internal */
export const extensionShape = declare('Extension', struct(ownedStructureShape, {
	...variant('extension'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureExtension.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureExtension.store
	 */
	store: makeSingleStoreFormat(),
}));

/** @internal */
export const spawningShape = struct({
	/**
	 * An array with the spawn directions, see
	 * [`StructureSpawn.Spawning.setDirections`](https://docs.screeps.com/api/#StructureSpawn.Spawning.setDirections).
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.directions
	 */
	directions: optional(vector(withType<Direction>('int8'))),

	/**
	 * Time needed in total to complete the spawning.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.needTime
	 */
	needTime: 'int32',
	'#spawnId': Id.format,
	'#spawningCreepId': Id.format,
	'#spawnTime': 'int32',
});

const [ spawningFormat, bindSpawningFormat ] = composeBind(spawningShape)<Spawning>();

/** @internal */
export { bindSpawningFormat };
export { spawningFormat };

/** @internal */
export const spawnShape = declare('Spawn', struct(ownedStructureShape, {
	...variant('spawn'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.hits
	 */
	hits: 'int32',

	/**
	 * Spawn's name. You choose the name upon creating a new spawn, and it cannot be changed later.
	 * This name is a hash key to access the spawn via the
	 * [Game.spawns](https://docs.screeps.com/api/#Game.spawns) object.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.name
	 */
	name: 'string',

	/**
	 * If the spawn is in process of spawning a new creep, this object will contain a
	 * [`StructureSpawn.Spawning`](https://docs.screeps.com/api/#StructureSpawn-Spawning) object, or
	 * null otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.spawning
	 */
	spawning: optional(spawningFormat, null),

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.store
	 */
	store: makeSingleStoreFormat(),
}));
