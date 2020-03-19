import { bindProcessor } from '~/engine/processor/bind';
import { gameTime } from '~/engine/runtime';
import { Source, nextRegenerationTime } from '~/engine/game/source';

function process(this: Source) {
	if (this.energy < this.energyCapacity) {
		console.log(this.ticksToRegeneration);
		if (this[nextRegenerationTime] === 0) {
			this[nextRegenerationTime] = gameTime + 1000;
		} else if (this.ticksToRegeneration === 0) {
			this.energy = this.energyCapacity;
		}
	}
}

export default () => bindProcessor(Source, { process });
