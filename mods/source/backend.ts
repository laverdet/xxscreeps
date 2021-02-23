import { bindMapRenderer } from 'xxscreeps/backend/sockets/map';
import { bindRenderer, renderObject } from 'xxscreeps/backend/sockets/render';
import { Source } from './source';

bindMapRenderer(Source, () => 's');

bindRenderer(Source, function render() {
	return {
		...renderObject(this),
		energy: this.energy,
		energyCapacity: this.energyCapacity,
		nextRegenerationTime: this._nextRegenerationTime,
	};
});
