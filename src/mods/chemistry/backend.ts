import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureLab } from './lab.js';

bindRenderer(StructureLab, (lab, next, previousTime) => {
	// Combine reaction1 & reaction2 into expected action log format
	const actionLog = function() {
		const actionLog = renderActionLog(lab['#actionLog'], previousTime);
		if (actionLog.reaction1 && actionLog.reaction2) {
			return {
				reaction: {
					x1: actionLog.reaction1.x, y1: actionLog.reaction1.y,
					x2: actionLog.reaction2.x, y2: actionLog.reaction2.y,
				},
			};
		}
	}();
	return {
		...next(),
		...renderStore(lab.store),
		actionLog,
		cooldown: lab.cooldown,
	};
});
