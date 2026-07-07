import type { TypeOf } from 'xxscreeps/schema/index.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { roomNameFormat } from 'xxscreeps/game/room/name.js';
import { optional, struct, vector } from 'xxscreeps/schema/index.js';

const sectorControlFormat = optional(struct({
	// The highway ring at range 5, shared with adjacent sectors.
	edges: vector(roomNameFormat),
	// The 9x9 interior at range <= 4, the center itself included; exclusive to this sector.
	members: vector(roomNameFormat),
}));

export type SectorControl = NonNullable<TypeOf<typeof sectorControlFormat>>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sectorSchema = registerStruct('RoomIntrinsics', {
	sectors: vector(roomNameFormat),
	sectorControl: sectorControlFormat,
});

declare module 'xxscreeps/game/map.js' {
	interface Schema { sector: [ typeof sectorSchema ] }
}
