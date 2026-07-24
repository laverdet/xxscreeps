import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureInvaderCore } from './invader-core.js';

bindRenderer(StructureInvaderCore, (core, next, previousTime) => {
	const deployTime = core['#deployTime'];
	return {
		...next(),
		...renderActionLog(core['#actionLog'], previousTime),
		level: core.level,
		...deployTime > 0 && {
			deployTime,
			// The client divides remaining ticks by `duration` for the effect countdown; vanilla's
			// backend stamps the fixed 5000-tick stronghold deploy window here.
			effects: [ { effect: C.EFFECT_INVULNERABILITY, endTime: deployTime, duration: 5000 } ],
		},
	};
});
