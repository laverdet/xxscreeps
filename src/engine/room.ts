import type { ShapeOf } from 'xxscreeps/schema';
import 'xxscreeps/game';
import 'xxscreeps/game/position';
import 'xxscreeps/game/object';
import 'xxscreeps/game/room';
import { Builder, makeReader, makeWriter } from 'xxscreeps/schema';
import { build, makeUpgrader } from 'xxscreeps/engine/schema';
import { format, objectFormat } from 'xxscreeps/game/room/schema';
import 'xxscreeps/config/mods/import/game';

// Base room reader & writer
const formatCache = new Map;
const builder = new Builder;
const schema = build(format, formatCache);
const objectSchema = build(objectFormat, formatCache);
export const read = makeReader(schema, builder);
export const write = makeWriter(schema, builder);
export const upgrade = makeUpgrader(schema, write);
export const readRoomObject = makeReader(objectSchema, builder);
export const writeRoomObject = makeWriter(objectSchema, builder);
export type Shape = ShapeOf<typeof format>;
