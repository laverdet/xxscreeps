import type { Dictionary } from 'xxscreeps/util/types';
import type { IntentsForReceiver, IntentParameters, IntentReceivers } from 'xxscreeps/processor';
import * as C from 'xxscreeps/game/constants';
import { IntentIdentifier } from 'xxscreeps/processor/symbols';

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsByGroup: Dictionary<Dictionary<any>> = Object.create(null);

	acquireIntentsForGroup(group: string) {
		const intents = this.intentsByGroup[group];
		delete this.intentsByGroup[group];
		return intents;
	}

	getIntentsForReceiver(receiver: IntentReceivers) {
		if (typeof receiver === 'string') {
			return this.intentsByGroup[receiver] ?? (this.intentsByGroup[receiver] = Object.create(null));
		}
		const { group, name } = receiver[IntentIdentifier];
		const intentsForGroup = this.intentsByGroup[group] ?? (this.intentsByGroup[group] = Object.create(null));
		return intentsForGroup[name] ?? (intentsForGroup[name] = Object.create(null));
	}

	push<
		Receiver extends IntentReceivers,
		Action extends IntentsForReceiver<Receiver>
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		const intents = this.getIntentsForReceiver(receiver);
		const list = intents[intent] ?? (intents[intent] = []);
		list.push(args);
		this.cpu += kCpuCost;
		return C.OK;
	}

	save<
		Receiver extends IntentReceivers,
		Action extends IntentsForReceiver<Receiver>,
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		const intents = this.getIntentsForReceiver(receiver);
		if (intents[intent] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[intent] = args;
		return C.OK;
	}
}
