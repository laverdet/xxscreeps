import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend/index.js';
import { StructurePortal } from './portal.js';

bindMapRenderer(StructurePortal, () => 'p');

bindRenderer(StructurePortal, (portal, next) => {
	const decayTime = portal['#decayTime'];
	const out = {
		...next(),
		destination: portal['#destShard'] === ''
			? { x: portal['#destX'], y: portal['#destY'], room: portal['#destRoom'] }
			: { shard: portal['#destShard'], room: portal['#destRoom'] },
	};
	if (decayTime === 0) {
		return out;
	}
	return { ...out, decayTime };
});
