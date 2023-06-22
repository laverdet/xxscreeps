import type { Manifest } from 'xxscreeps/config/mods/index.js';
import type { ConstructionTraits } from './symbols.js';
import { structureFactories } from './symbols.js';

export function registerBuildableStructure(structureType: string, factory: ConstructionTraits) {
	structureFactories.set(structureType, factory);
}

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/creep' ],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
