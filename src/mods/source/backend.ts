import config from 'xxscreeps/config';
import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureKeeperLair } from './keeper-lair';
import { Source } from './source';

if (config.backend.socketSkipsPermanents) {
	bindMapRenderer(StructureKeeperLair, () => undefined);
	bindTerrainRenderer(Source, () => 0x5af3ff);
	bindTerrainRenderer(StructureKeeperLair, () => 0x0f0f64);
} else {
	bindMapRenderer(Source, () => 's');
	bindMapRenderer(StructureKeeperLair, () => 'k');
}

bindRenderer(Source, (source, next) => ({
	...next(),
	energy: source.energy,
	energyCapacity: source.energyCapacity,
	nextRegenerationTime: source['#nextRegenerationTime'],
}));

bindRenderer(StructureKeeperLair, (keeperLair, next) => ({
	...next(),
	nextSpawnTime: keeperLair['#nextSpawnTime'],
}));
