import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { StructureRoad } from './road';

bindMapRenderer(StructureRoad, () => 'r');

bindRenderer(StructureRoad, (road, next) => ({
	...next(),
	nextDecayTime: road['#nextDecayTime'],
}));
