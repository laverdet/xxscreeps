import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureLab } from './lab.js';

interface LabActionCoordinates {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

interface RenderedLabActionLog {
	runReaction: LabActionCoordinates | undefined;
	reverseReaction: LabActionCoordinates | undefined;
}

bindRenderer(StructureLab, (lab, next, previousTime) => {
	// Combine paired action log entries into the format the client expects
	const actionLog = function(): RenderedLabActionLog {
		// renderActionLog nests entries under `.actionLog` (cf. the creep/tower renderers).
		const actionLog = renderActionLog(lab['#actionLog'], previousTime);
		// Return the object even when empty: the diff then clears just the changed reaction
		// sub-key instead of nulling the whole `actionLog`, which breaks the client's lab renderer.
		return {
			runReaction: actionLog.reaction1 && actionLog.reaction2 && {
				x1: actionLog.reaction1.x, y1: actionLog.reaction1.y,
				x2: actionLog.reaction2.x, y2: actionLog.reaction2.y,
			},
			reverseReaction: actionLog.reverseReaction1 && actionLog.reverseReaction2 && {
				x1: actionLog.reverseReaction1.x, y1: actionLog.reverseReaction1.y,
				x2: actionLog.reverseReaction2.x, y2: actionLog.reverseReaction2.y,
			},
		};
	}();
	return {
		...next(),
		...renderStore(lab.store),
		actionLog,
		cooldown: lab.cooldown,
	};
});
