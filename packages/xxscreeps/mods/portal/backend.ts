import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend/index.js';
import { StructurePortal } from './portal.js';

bindMapRenderer(StructurePortal, () => 'p');

bindRenderer(StructurePortal, (portal, next) => ({
	...next(),
	destination: portal.destination,
	decayTime: portal['#decayTime'] || undefined,
}));
