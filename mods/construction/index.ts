import { StructureFactory, structureFactories } from './symbols';

export function registerBuildableStructure(structureType: string, factory: StructureFactory) {
	structureFactories.set(structureType, factory);
}
