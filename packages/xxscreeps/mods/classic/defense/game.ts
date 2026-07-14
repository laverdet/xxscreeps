import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureRampart } from './rampart.js';
import { rampartShape, towerShape, wallShape } from './schema.js';
import { StructureTower } from './tower.js';
import { StructureWall } from './wall.js';

// Export `StructureTower` and `StructureWall` to runtime globals
registerGlobal(StructureRampart);
registerGlobal(StructureTower);
registerGlobal(StructureWall);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const rampartSchema = registerVariant('Room.objects', compose(rampartShape, StructureRampart));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const towerSchema = registerVariant('Room.objects', compose(towerShape, StructureTower));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const wallSchema = registerVariant('Room.objects', compose(wallShape, StructureWall));

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema {
		defense: [
			typeof rampartSchema,
			 typeof towerSchema,
			 typeof wallSchema,
		];
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureRampart: typeof StructureRampart;
		StructureTower: typeof StructureTower;
		StructureWall: typeof StructureWall;
	}
}
