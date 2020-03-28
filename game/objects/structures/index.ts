import { Owner, RoomObject } from '../room-object';
import { gameContext } from '~/game/context';
export { Owner };

export abstract class Structure extends RoomObject {
	abstract get structureType(): string;
	get my() { return this[Owner] === gameContext.userId }

	hits!: number;
	hitsMax!: number;
	[Owner]!: string;
}
