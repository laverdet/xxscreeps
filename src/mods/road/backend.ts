import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { NextDecayTime, StructureRoad } from './road';

bindMapRenderer(StructureRoad, () => 'r');

bindRenderer(StructureRoad, (road, next) => ({
	...next(),
	nextDecayTime: road[NextDecayTime],
}));
