import { makeReader, makeWriter, TypeOf } from 'xxscreeps/schema';
import { format } from 'xxscreeps/game/room/schema';
import 'xxscreeps/config/mods/import/game';

// Base room reader & writer
export const read = makeReader(format);
export const write = makeWriter(format);
export type Shape = TypeOf<typeof format>;
