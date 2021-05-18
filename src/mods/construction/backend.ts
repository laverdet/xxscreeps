import { bindRenderer } from 'xxscreeps/backend';
import { ConstructionSite } from './construction-site';

bindRenderer(ConstructionSite, (constructionSite, next) => ({
	...next(),
	progress: constructionSite.progress,
	progressTotal: constructionSite.progressTotal,
	structureType: constructionSite.structureType,
	user: constructionSite['#user'],
}));
