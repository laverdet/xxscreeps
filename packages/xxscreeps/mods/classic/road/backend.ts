import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend/index.js';
import { StructureRoad } from './road.js';

bindMapRenderer(StructureRoad, () => 'r');

bindRenderer(StructureRoad, (road, next) => ({
	...next(),
	nextDecayTime: road['#nextDecayTime'],
}));
