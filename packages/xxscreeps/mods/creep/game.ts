import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource.js';
import { constant, struct, variant } from 'xxscreeps/schema/index.js';
import { Creep, format as creepFormat } from './creep.js';
import { Tombstone, format as tombstoneFormat } from './tombstone.js';

// Add `creeps` to global `Game` object
declare module 'xxscreeps/game/game.js' {
	interface Game {
		creeps: Record<string, Creep>;
	}
}
hooks.register('gameInitializer', Game => Game.creeps = Object.create(null));

// Export `Creep` & `Tombstone` to runtime globals
registerGlobal(Creep);
registerGlobal(Tombstone);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Creep: typeof Creep;
		Tombstone: typeof Tombstone;
	}
}

// Register FIND_ types for `Creep` & `Tombstone`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => !creep.my && !creep.spawning),
	[C.FIND_TOMBSTONES]: room => room['#lookFor'](C.LOOK_TOMBSTONES),
});

// Register LOOK_ type for `Creep` & `Tombstone`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = [
	registerLook<Creep>()(C.LOOK_CREEPS),
	registerLook<Tombstone>()(C.LOOK_TOMBSTONES),
];
declare module 'xxscreeps/game/room/index.js' {
	interface Find { creep: typeof find }
	interface Look { creep: typeof look }
}

// Schema types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const creepSchema = registerVariant('Room.objects', creepFormat);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tombstoneSchema = registerVariant('Room.objects', tombstoneFormat);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const transferEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_TRANSFER),
	event: constant(C.EVENT_TRANSFER),
	objectId: Id.format,
	targetId: Id.format,
	resourceType: resourceEnumFormat,
	amount: 'int32',
}));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const exitEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_EXIT),
	event: constant(C.EVENT_EXIT),
	objectId: Id.format,
	room: 'string',
	x: 'int8',
	y: 'int8',
}));
declare module 'xxscreeps/game/room/index.js' {
	interface Schema {
		creep: [
			typeof creepSchema,
			typeof tombstoneSchema,
			typeof transferEventSchema,
			typeof exitEventSchema,
		];
	}
}
