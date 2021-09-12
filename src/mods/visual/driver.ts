import * as Fn from 'xxscreeps/utility/functional';
import { hooks } from 'xxscreeps/engine/runner';
import { publishVisualsBlobsForNextTick } from './model';

declare module 'xxscreeps/engine/runner' {
	interface TickResult {
		visuals: {
			blob: Readonly<Uint8Array>;
			roomName: string;
		}[];
	}
}

hooks.register('runnerConnector', player => [ undefined, {
	async save(result) {
		const validPayloads = Fn.filter(result.visuals, ({ roomName }) =>
			roomName === '*' || roomName === 'map' || player.world.terrain.has(roomName));
		const payload = new Map(Fn.map(validPayloads, payload =>
			[ payload.roomName, payload.blob ]));
		await publishVisualsBlobsForNextTick(player.shard, player.userId, payload);
	},
} ]);
