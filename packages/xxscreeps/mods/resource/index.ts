import type { Manifest } from 'xxscreeps/config/mods.js';

export type { ResourceType } from './resource.js';
export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/structure' ],
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
};

export interface Schema {}
