import { makeReader, makeWriter } from 'xxscreeps/schema';
import { format } from 'xxscreeps/game/room/schema';

// Base room reader & writer
export const read = makeReader(format);
export const write = makeWriter(format);
