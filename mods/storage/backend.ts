import { bindRenderer } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureStorage } from './storage';

bindRenderer(StructureStorage, (storage, next) => ({
	...next(),
	...renderStore(storage.store),
}));
