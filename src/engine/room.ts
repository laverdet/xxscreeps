import { makeReader, makeWriter, ShapeOf } from 'xxscreeps/schema';
import { Cache } from 'xxscreeps/schema/cache';
import { format, objectFormat } from 'xxscreeps/game/room/schema';
import 'xxscreeps/config/mods/import/game';

// Base room reader & writer
const cache = new Cache;
export const read = makeReader(format, cache);
export const write = makeWriter(format, cache);
export const readRoomObject = makeReader(objectFormat, cache);
export const writeRoomObject = makeWriter(objectFormat, cache);
export type Shape = ShapeOf<typeof format>;
