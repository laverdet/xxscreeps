import { connect, Provider } from '~/storage';

export class Shard {
	private constructor(
		public readonly storage: Provider,
	) {}

	static async connect(shard: string) {
		const provider = await connect(shard);
		return new Shard(provider);
	}
}
