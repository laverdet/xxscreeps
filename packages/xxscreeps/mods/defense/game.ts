import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as Rampart from './rampart.js';
import * as Tower from './tower.js';
import * as Wall from './wall.js';

// Register schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const rampartSchema = registerVariant('Room.objects', Rampart.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const towerSchema = registerVariant('Room.objects', Tower.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const wallSchema = registerVariant('Room.objects', Wall.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { defense: [ typeof rampartSchema, typeof towerSchema, typeof wallSchema ] }
}

// Export `StructureTower` and `StructureWall` to runtime globals
registerGlobal(Rampart.StructureRampart);
registerGlobal(Tower.StructureTower);
registerGlobal(Wall.StructureWall);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureRampart: typeof Rampart.StructureRampart;
		StructureTower: typeof Tower.StructureTower;
		StructureWall: typeof Wall.StructureWall;
	}
}
