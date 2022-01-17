import C from 'xxscreeps/game/constants';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';

const resources = [
	C.RESOURCE_OPS,
];
const resourceSchema = registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);

declare module 'xxscreeps/mods/resource' {
	interface Schema { power: typeof resourceSchema }
}
