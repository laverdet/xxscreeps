import { getReader, getWriter } from '~/lib/schema';
import * as Room from './room';
export const readRoom = getReader(Room.format);
export const writeRoom = getWriter(Room.format);
