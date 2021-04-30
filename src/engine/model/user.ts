import type { Shard } from './shard';
import { Channel } from 'xxscreeps/storage/channel';
import { makeReader } from 'xxscreeps/schema';
import * as Visual from 'xxscreeps/game/visual';

type ConsoleMessage =
	{ type: 'log'; value: string } |
	{ type: 'error'; value: string } |
	{ type: 'result'; value: string };

export function getConsoleChannel(shard: Shard, user: string) {
	return new Channel<ConsoleMessage>(shard.pubsub, `user/${user}/console`);
}

const visualsReader = makeReader(Visual.schema);
export async function loadVisuals(shard: Shard, user: string, time: number) {
	const fragment = `visual${time % 2}`;
	try {
		return visualsReader(await shard.blob.reqBuffer(`user/${user}/${fragment}`));
	} catch (err) {}
}

export async function saveVisualsBlob(shard: Shard, user: string, time: number, visual: Readonly<Uint8Array> | undefined) {
	const fragment = `visual${time % 2}`;
	if (visual) {
		await shard.blob.set(`user/${user}/${fragment}`, visual);
	} else {
		try {
			await shard.blob.del(`user/${user}/${fragment}`);
		} catch (err) {}
	}
}

//
// User memory functions
export async function loadUserMemoryBlob(shard: Shard, user: string) {
	return shard.blob.getBuffer(`memory/${user}`);
}
