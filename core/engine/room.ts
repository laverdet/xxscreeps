import { makeReader, makeWriter } from 'xxscreeps/schema';
import { format } from 'xxscreeps/game/room/schema';
import 'xxscreeps/config/mods';
import 'xxscreeps/config/mods/import/game';

// Base room reader & writer
export const read = makeReader(format);
export const write = makeWriter(format);
