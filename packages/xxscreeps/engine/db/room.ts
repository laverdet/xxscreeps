import type { Format } from 'xxscreeps/schema/index.js';
import type { LayoutAndTraits } from 'xxscreeps/schema/layout.js';
import 'xxscreeps/game/index.js';
import 'xxscreeps/game/position.js';
import 'xxscreeps/game/object.js';
import 'xxscreeps/game/room/index.js';
import 'xxscreeps:mods/game';
import { build, makeUpgrader } from 'xxscreeps/engine/schema/index.js';
import { format, objectFormat } from 'xxscreeps/game/room/schema.js';
import { Builder, makeReader, makeWriter } from 'xxscreeps/schema/index.js';

// Base room reader & writer
const formatCache = new Map<Format, LayoutAndTraits>();
const builder = new Builder();
const schema = build(format, formatCache);
const objectSchema = build(objectFormat, formatCache);
export const read = makeReader(schema, builder);
export const write = makeWriter(schema, builder);
export const upgrade = makeUpgrader(schema, write);
export const readRoomObject = makeReader(objectSchema, builder);
export const writeRoomObject = makeWriter(objectSchema, builder);
