import type { Endpoint } from 'xxscreeps/backend/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';

// Lets mods amend the `serverData` bag advertised at `/api/version`, e.g. to
// publish feature flags or settings the client needs at connect time.
const decorateServerData = hooks.makeIterated('version');

export const VersionEndpoint: Endpoint = {
	path: '/api/version',

	execute() {
		const serverData: Record<string, unknown> = {
			features: [
				{ name: 'auth', version: 1 },
				{ name: 'official-like', version: 1 },
			],
			customObjectTypes: {},
			renderer: {
				resources: {},
				metadata: {},
			},
			shards: config.shards.map(shard => shard.name),
		};
		decorateServerData(serverData);
		return {
			ok: 1,
			protocol: 14,
			package: 160,
			useNativeAuth: false,
			users: 1,
			serverData,
			packageVersion: 'xxscreeps',
		};
	},
};
