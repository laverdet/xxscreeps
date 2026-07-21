import type { NullMessage } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

export type GlobalPowerChannel = Channel<
	NullMessage |
	{ type: 'power'; power: number }
>;

export const globalPowerChannel =
	(shard: Shard, userId: string): GlobalPowerChannel => new Channel(shard.pubsub, `user/${userId}/globalPower`);

export async function incrementGlobalPowerLevel(shard: Shard, userId: string, amount: number) {
	const power = await shard.db.data.hincrBy(User.infoKey(userId), 'power', amount);
	await globalPowerChannel(shard, userId).publish({ type: 'power', power });
}
