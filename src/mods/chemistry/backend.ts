import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureLab } from './lab.js';

bindRenderer(StructureLab, (lab, next, previousTime) => {
	// Combine paired action log entries into the format the client expects
	const actionLog = function() {
		const raw = renderActionLog(lab['#actionLog'], previousTime);
		const result: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {};
		if (raw.reaction1 && raw.reaction2) {
			result.runReaction = {
				x1: raw.reaction1.x, y1: raw.reaction1.y,
				x2: raw.reaction2.x, y2: raw.reaction2.y,
			};
		}
		if (raw.reverseReaction1 && raw.reverseReaction2) {
			result.reverseReaction = {
				x1: raw.reverseReaction1.x, y1: raw.reverseReaction1.y,
				x2: raw.reverseReaction2.x, y2: raw.reverseReaction2.y,
			};
		}
		return Object.keys(result).length ? result : undefined;
	}();
	return {
		...next(),
		...renderStore(lab.store),
		actionLog,
		cooldown: lab.cooldown,
	};
});
