import * as Rampart from './rampart.js';
import * as Tower from './tower.js';
import * as Wall from './wall.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';

// Register schema
const rampartSchema = registerVariant('Room.objects', Rampart.format);
const towerSchema = registerVariant('Room.objects', Tower.format);
const wallSchema = registerVariant('Room.objects', Wall.format);
declare module 'xxscreeps/game/room' {
	interface Schema { defense: [ typeof rampartSchema, typeof towerSchema, typeof wallSchema ] }
}

// Export `StructureTower` and `StructureWall` to runtime globals
registerGlobal(Rampart.StructureRampart);
registerGlobal(Tower.StructureTower);
registerGlobal(Wall.StructureWall);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		StructureRampart: typeof Rampart.StructureRampart;
		StructureTower: typeof Tower.StructureTower;
		StructureWall: typeof Wall.StructureWall;
	}
}
