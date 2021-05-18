import * as Rampart from './rampart';
import * as Tower from './tower';
import * as Wall from './wall';
import { registerGlobal } from 'xxscreeps/game';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema1 = registerSchema('Room.objects', Rampart.format);
const schema2 = registerSchema('Room.objects', Tower.format);
const schema3 = registerSchema('Room.objects', Wall.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		defense: typeof schema1;
		defense2: typeof schema2;
		defense3: typeof schema3;
	}
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
