import type { BlobProvider } from 'xxscreeps/storage';
import type { TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/schema/id';
import { getOrSet } from 'xxscreeps/utility/utility';
import { declare, struct, vector } from 'xxscreeps/schema';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema';

export function flattenUsername(username: string) {
	return username.replace(/[-_]/g, '').toLowerCase();
}

const format = declare('Entries', vector(struct({
	key: 'string',
	user: Id.format,
})));

type Shape = TypeOf<typeof format>;
const { read, write } = makeReaderAndWriter(format);
export { write };

export class Authentication {
	private readonly providerToUser = new Map<string, string>();
	private readonly userToProvider = new Map<string, string[]>();

	constructor(
		private readonly blob: BlobProvider,
		private readonly data: Shape,
	) {
		// Index provider entries
		for (const entry of data) {
			this.providerToUser.set(entry.key, entry.user);
			getOrSet(this.userToProvider, entry.user, () => []).push(entry.key);
		}
	}

	static async connect(blob: BlobProvider) {
		return new Authentication(blob, read(await blob.reqBuffer('auth')));
	}

	associateUser(providerKey: string, userId: string) {
		if (this.providerToUser.has(providerKey)) {
			throw new Error('Existing provider key already exists');
		}
		this.providerToUser.set(providerKey, userId);
		getOrSet(this.userToProvider, userId, () => []).push(providerKey);
		this.data.push({ key: providerKey, user: userId });
	}

	getProvidersForUser(userId: string) {
		return this.userToProvider.get(userId)!;
	}

	lookupUserByProvider(providerKey: string) {
		return this.providerToUser.get(providerKey);
	}

	usernameToProviderKey(username: string) {
		return `username:${flattenUsername(username)}`;
	}

	save() {
		return this.blob.set('auth', write(this.data));
	}
}
