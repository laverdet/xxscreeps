import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import type { structureTypeEnumFormat } from '~/engine/schema/construction-site';
import { FormatShape, Variant } from '~/lib/schema';
import { Owner, RoomObject } from './room-object';

export type ConstructibleStructureType = FormatShape<typeof structureTypeEnumFormat>;
export const Name = Symbol('name');

export class ConstructionSite extends RoomObject {
	get [Variant]() { return 'constructionSite' }
	get my() { return this[Owner] === gameContext.userId }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }

	progress!: number;
	structureType!: ConstructibleStructureType;
	[Name]!: string;
	[Owner]!: string;
}
