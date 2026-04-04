import type { Manifest } from 'xxscreeps/config/mods/index.js';

export type { ResourceType } from './resource.js';
export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/structure' ],
	provides: [ 'constants', 'game', 'processor', 'render', 'test' ],
};

export interface Schema {}
