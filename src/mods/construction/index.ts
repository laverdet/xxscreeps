import type { Manifest } from 'xxscreeps/config/mods';
import type { ConstructionTraits } from './symbols';
import { structureFactories } from './symbols';

export function registerBuildableStructure(structureType: string, factory: ConstructionTraits) {
	structureFactories.set(structureType, factory);
}

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/creep' ],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
