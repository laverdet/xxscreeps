import { makeVariant } from '~/lib/schema';
import * as Controller from './controller';
import * as ConstructionSite from './construction-site';
import * as Creep from './creep';
import * as Source from './source';
import * as Spawn from './spawn';

export const variantFormat = makeVariant(
	ConstructionSite.format,
	Controller.format,
	Creep.format,
	Source.format,
	Spawn.format,
);
