import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';

const gamePausedKey = 'game/paused';

export function getGameControlChannel(shard: Shard) {
	type Message =
		{ type: 'pauseChanged'; paused: boolean };
	return new Channel<Message>(shard.pubsub, 'channel/game-control');
}

export async function isGamePaused(shard: Shard) {
	return await shard.data.get(gamePausedKey) !== null;
}

export async function setGamePaused(shard: Shard, paused: boolean) {
	if (paused) {
		await shard.data.set(gamePausedKey, Date.now());
	} else {
		await shard.data.vdel(gamePausedKey);
	}
	await getGameControlChannel(shard).publish({ type: 'pauseChanged', paused });
}
