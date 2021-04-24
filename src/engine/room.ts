import 'xxscreeps/game';
import 'xxscreeps/game/position';
import 'xxscreeps/game/object';
import 'xxscreeps/game/room';
import { makeReader, makeWriter, Cache, ShapeOf } from 'xxscreeps/schema';
import { build } from 'xxscreeps/engine/schema';
import { format, objectFormat } from 'xxscreeps/game/room/schema';
import 'xxscreeps/config/mods/import/game';

// Base room reader & writer
const buildCache = new Map;
const cache = new Cache;
const schema = build(format, buildCache);
const objectSchema = build(objectFormat, buildCache);
export const read = makeReader(schema, cache);
export const write = makeWriter(schema, cache);
export const readRoomObject = makeReader(objectSchema, cache);
export const writeRoomObject = makeWriter(objectSchema, cache);
export type Shape = ShapeOf<typeof format>;
