import type { DeferListener } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { AsyncDisposableResource } from 'xxscreeps/utility/utility.js';

interface GlobalPowerMessage {
	type: 'power';
	power: number;
}

function globalPowerChannel(shard: Shard, userId: string) {
	return new Channel<GlobalPowerMessage>(shard.pubsub, `user/${userId}/globalPower`);
}

export async function incrementGlobalPowerLevel(shard: Shard, userId: string, amount: number) {
	const power = await shard.db.data.hincrBy(User.infoKey(userId), 'power', amount);
	await globalPowerChannel(shard, userId).publish({ type: 'power', power });
}

export class GlobalPowerWatcher extends AsyncDisposableResource {
	power;

	constructor(disposable: DisposableStack, power: number, listen: DeferListener<GlobalPowerMessage>) {
		super();
		this.disposable.use(disposable);
		this.power = power;
		listen(event => {
			this.power = Math.max(this.power, event.power);
		});
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = globalPowerChannel(shard, userId);
		const subscription = disposable.adopt(await channel.subscribe(), channel => channel.disconnect());
		const listen = subscription.listenDeferred();
		const power = await shard.db.data.hGet(User.infoKey(userId), 'power');
		return new GlobalPowerWatcher(disposable.move(), Number(power) || 0, listen);
	}
}
