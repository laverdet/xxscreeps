import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import { insertObject, removeObject } from 'xxscreeps/game/room/methods';
import * as Container from 'xxscreeps/mods/resource/container';
import * as Extension from 'xxscreeps/game/objects/structures/extension';
import * as Road from 'xxscreeps/game/objects/structures/road';
import * as Storage from 'xxscreeps/game/objects/structures/storage';
import * as Tower from 'xxscreeps/game/objects/structures/tower';

registerObjectTickProcessor(ConstructionSite, site => {
	if (site.progress >= site.progressTotal) {
		const { pos, room, structureType, _owner } = site;
		const level = site.room.controller?.level ?? 0;
		removeObject(site);
		const structure = function() {
			switch (structureType) {
				case 'container': return Container.create(pos);
				case 'extension': return Extension.create(pos, level, _owner);
				case 'road': return Road.create(pos);
				case 'storage': return Storage.create(pos, _owner);
				case 'tower': return Tower.create(pos, _owner);
				default:
			}
		}();
		if (structure) {
			insertObject(room, structure);
		}
	}
});
