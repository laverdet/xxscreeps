import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureLab } from './lab.js';
import { labShape } from './schema.js';

export type ChemistryRoomSchema = typeof labSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const labSchema = registerVariant('Room.objects', compose(labShape, StructureLab));
