import type { Direction } from 'xxscreeps/game/position.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeSingleStoreFormat } from 'xxscreeps/mods/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, optional, struct, variant, vector, withType } from 'xxscreeps/schema/index.js';

/** @internal */
export const extensionShape = declare('Extension', struct(ownedStructureShape, {
	...variant('extension'),
	hits: 'int32',
	store: makeSingleStoreFormat(),
}));

// `StructureSpawn.Spawning` format. Exported because `StructureInvaderCore` reuses the same record
// for its NPC defender spawns.
export const spawningFormat = struct({
	directions: optional(vector(withType<Direction>('int8'))),
	needTime: 'int32',
	'#spawnId': Id.format,
	'#spawningCreepId': Id.format,
	'#spawnTime': 'int32',
});
