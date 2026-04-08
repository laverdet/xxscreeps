import { bindRenderer } from 'xxscreeps/backend/index.js';
import { ConstructionSite } from './construction-site.js';

bindRenderer(ConstructionSite, (constructionSite, next) => ({
	...next(),
	progress: constructionSite.progress,
	progressTotal: constructionSite.progressTotal,
	structureType: constructionSite.structureType,
	user: constructionSite['#user'],
}));
