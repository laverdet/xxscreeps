import type { Manifest } from 'xxscreeps/config/mods';
export type { ResourceType } from './resource';
export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/structure' ],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};

export interface Schema {}
