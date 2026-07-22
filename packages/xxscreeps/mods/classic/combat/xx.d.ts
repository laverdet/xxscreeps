declare module 'xxscreeps:mods/game' {
	import type { CombatRoomSchemas } from 'xxscreeps/mods/classic/combat/schema.js';

	enum ActionLogSchema {
		attack = 'attack',
		attacked = 'attacked',
		heal = 'heal',
		healed = 'healed',
		rangedAttack = 'rangedAttack',
		rangedHeal = 'rangedHeal',
		rangedMassAttack = 'rangedMassAttack',
	}
	interface RoomSchema { combat: CombatRoomSchemas }
}
