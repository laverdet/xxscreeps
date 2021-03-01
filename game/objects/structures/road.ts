import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { compose, declare, member, struct, variant, withOverlay } from 'xxscreeps/schema';
import * as Structure from '.';

export const NextDecayTime = Symbol('nextDecayTime');

export function format() { return compose(shape, StructureRoad) }
const shape = declare('Road', struct(Structure.format, {
	...variant('road'),
	nextDecayTime: member(NextDecayTime, 'int32'),
}));

export class StructureRoad extends withOverlay(shape)(Structure.Structure) {
	get structureType() { return C.STRUCTURE_ROAD }
	get ticksToDecay() { return Math.max(0, this[NextDecayTime] - Game.time) }
}
