import { makeVariant } from '~/engine/schema';
import * as Creep from './creep';
import * as Source from './source';
import * as StructureSpawn from './structures/spawn';

export const variantFormat = makeVariant(
	Creep.format,
	Source.format,
	StructureSpawn.format,
);
