import { hooks } from 'xxscreeps/driver';
import { publishVisualsBlobForNextTick } from './model';

declare module 'xxscreeps/driver' {
	interface TickResult {
		visuals?: {
			blob: Readonly<Uint8Array>;
			roomNames: string[];
		};
	}
}

hooks.register('driverConnector', player => [ undefined, {
	async save(payload) {
		// Publish visuals
		const { visuals } = payload;
		if (visuals) {
			await publishVisualsBlobForNextTick(player.shard, player.userId, visuals.roomNames, visuals.blob);
		}
	},
} ]);
