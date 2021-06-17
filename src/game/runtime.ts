import type { GameConstructor } from '.';
import * as C from './constants';
import lodash from 'lodash';
import { globals, registerGlobal } from './symbols';
import { hooks } from 'xxscreeps/driver';

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
registerGlobal(function StructureTerminal() {});
registerGlobal(function Tombstone() {});

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
