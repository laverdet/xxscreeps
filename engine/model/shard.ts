import { connect, Provider } from '~/storage';

export class Shard {
	private constructor(
		public readonly storage: Provider,
		public readonly terrainBlob: Readonly<Uint8Array>,
	) {}

	static async connect(shard: string) {
		const provider = await connect(shard);
		const terrainBlob = await provider.persistence.get('terrain');
		return new Shard(provider, terrainBlob);
	}
}
