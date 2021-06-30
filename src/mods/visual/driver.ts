import { hooks } from 'xxscreeps/engine/runner';
import { publishVisualsBlobForNextTick } from './model';

declare module 'xxscreeps/engine/runner' {
	interface TickResult {
		visuals?: {
			blob: Readonly<Uint8Array>;
			roomNames: string[];
		};
	}
}

hooks.register('runnerConnector', player => [ undefined, {
	async save(payload) {
		// Publish visuals
		const { visuals } = payload;
		if (visuals) {
			await publishVisualsBlobForNextTick(player.shard, player.userId, visuals.roomNames, visuals.blob);
		}
	},
} ]);
