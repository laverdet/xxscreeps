import type { GlobalPowerChannel } from './model.js';
import type { DeferListener, MessageFor } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { DisposableResource } from 'xxscreeps/utility/utility.js';
import { globalPowerChannel } from './model.js';

class GlobalPowerWatcher extends DisposableResource {
	power;

	private constructor(disposable: DisposableStack, power: number, listen: DeferListener<MessageFor<GlobalPowerChannel>>) {
		super(disposable);
		this.power = power;
		listen(event => {
			if (event.type === 'power') {
				this.power = Math.max(this.power, event.power);
			}
		});
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = globalPowerChannel(shard, userId);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const power = await shard.db.data.hGet(User.infoKey(userId), 'power');
		return new GlobalPowerWatcher(disposable.move(), Number(power) || 0, listen);
	}
}

hooks.register('runnerConnector', async player => {
	const { shard, userId } = player;
	const watcher = await GlobalPowerWatcher.create(shard, userId);
	return [ () => watcher.dispose(), {
		refresh(payload) {
			payload.power = watcher.power;
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		power: number;
	}
}
