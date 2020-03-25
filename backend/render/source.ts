import { Source } from '~/engine/game/objects/source';
import { bindRenderer } from '.';

export default function() {
	bindRenderer(Source, function render() {
		return {
			_id: this.id,
			type: 'source',
			x: this.pos.x,
			y: this.pos.y,
			energy: this.energy,
			energyCapacity: this.energyCapacity,
			ticksToRegeneration: this.ticksToRegeneration,
		};
	});
}
