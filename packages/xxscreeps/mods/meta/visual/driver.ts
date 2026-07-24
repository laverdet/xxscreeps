import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { publishVisualsBlobsForNextTick } from './model.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickResult {
		visuals: {
			blob: Readonly<Uint8Array>;
			roomName: string;
		}[];
	}
}

hooks.register('runnerConnector', player => [ undefined, {
	async save(result) {
		const payload = Fn.pipe(
			result.visuals,
			$$ => Fn.filter($$, ({ roomName }) =>
				roomName === '*' || roomName === 'map' || player.world.terrain.has(roomName)),
			$$ => Fn.map($$, payload => [ payload.roomName, payload.blob ] as const),
			$$ => new Map($$));
		await publishVisualsBlobsForNextTick(player.shard, player.userId, payload);
	},
} ]);
