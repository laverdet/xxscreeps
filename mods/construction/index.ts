import { ConstructionTraits, structureFactories } from './symbols';

export function registerBuildableStructure(structureType: string, factory: ConstructionTraits) {
	structureFactories.set(structureType, factory);
}
