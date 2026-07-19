import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { declare, enumerated, struct, vector } from 'xxscreeps/schema/index.js';

// The seven series the classic client renders on the profile / overview pages and the world map
export type StatName = typeof statNames[number];
export const statNames = [
	'creepsLost', 'creepsProduced', 'energyConstruction', 'energyControl',
	'energyCreeps', 'energyHarvested', 'powerProcessed',
] as const;

export function isStatName(value: string): value is StatName {
	return statNames.some(name => name === value);
}

// Per-user stat contributions accumulated on the room blob since it last began to fill, coalesced
// to one entry per (user, stat) pair
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#userStats': vector(declare('UserStats', struct({
		amount: 'int32',
		stat: enumerated(...statNames),
		userId: Id.format,
	}))),
	// Wall-clock time the first entry landed
	'#userStatsTime': 'double',
});

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { stats: [ typeof roomSchema ] }
}
