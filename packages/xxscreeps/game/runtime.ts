import type { GameConstructor } from './index.js';
// @ts-expect-error
import lodash_es from 'lodash-es';
import * as C from './constants/index.js';
import { globals, hooks, registerGlobal } from './symbols.js';

const lodash = lodash_es as typeof import('lodash');

registerGlobal('_', lodash);

registerGlobal(function Deposit() {});
registerGlobal(function Nuke() {});
registerGlobal(function PowerCreep() {});
registerGlobal(function Ruin() {});
registerGlobal(function StructureFactory() {});
registerGlobal(function StructureInvaderCore() {});
registerGlobal(function StructureNuker() {});
registerGlobal(function StructureObserver() {});
registerGlobal(function StructurePowerBank() {});
registerGlobal(function StructurePowerSpawn() {});
registerGlobal(function StructurePortal() {});

declare const globalThis: any;
hooks.register('runtimeConnector', {
	initialize() {
		Object.entries(C).forEach(([ identifier, value ]) => globalThis[identifier] = value);
	},
});

// Used to extract type information from bundled dts file, via make-types.ts
export interface Global {
	Game: GameConstructor;
	console: Console;
}
export function globalNames() {
	return [ 'Game', 'console', ...globals ];
}
export function globalTypes(): Global {
	return undefined as never;
}
