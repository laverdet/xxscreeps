import { registerStruct } from 'xxscreeps/engine/schema/index.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const creepSchema = registerStruct('Creep', {
	'#noAttackNotify': 'bool',
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const structureSchema = registerStruct('OwnedStructure', {
	'#noAttackNotify': 'bool',
});

// ---

declare module 'xxscreeps/mods/classic/creep/schema.js' {
	interface CreepSchema { notifications: [ typeof creepSchema ] }
}

declare module 'xxscreeps/mods/classic/structure/schema.js' {
	interface OwnedStructureSchema { notifications: [ typeof structureSchema ] }
}
