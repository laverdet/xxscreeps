import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureLab } from './lab.js';

interface RenderedActionLog {
	actionLog: Record<string, { x: number; y: number }>;
}

bindRenderer(StructureLab, (lab, next, previousTime) => {
	// Combine paired action log entries into the format the client expects
	const actionLog = function() {
		// renderActionLog nests entries under `.actionLog` (cf. the creep/tower renderers).
		const { actionLog: raw } = renderActionLog(lab['#actionLog'], previousTime) as RenderedActionLog;
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
		// Return the object even when empty: the diff then clears just the changed reaction
		// sub-key instead of nulling the whole `actionLog`, which breaks the client's lab renderer.
		return result;
	}();
	return {
		...next(),
		...renderStore(lab.store),
		actionLog,
		cooldown: lab.cooldown,
	};
});
