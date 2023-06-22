import 'xxscreeps/game/index.js';
import 'xxscreeps/game/position.js';
import 'xxscreeps/game/object.js';
import 'xxscreeps/game/room/index.js';
import { Builder, makeReader, makeWriter } from 'xxscreeps/schema/index.js';
import { build, makeUpgrader } from 'xxscreeps/engine/schema/index.js';
import { format, objectFormat } from 'xxscreeps/game/room/schema.js';
import 'xxscreeps/config/mods/import/game.js';

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
