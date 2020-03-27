import { makeVariant } from '~/lib/schema';
import * as StructureController from './controller';
import * as Creep from './creep';
import * as Source from './source';
import * as Spawn from './spawn';

export const variantFormat = makeVariant(
	Creep.format,
	Source.format,
	StructureController.format,
	Spawn.format,
);
