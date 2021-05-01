import type { BackendContext } from 'xxscreeps/backend/context';
import * as User from 'xxscreeps/engine/metadata/user';

export async function loadUser(context: BackendContext, user: string) {
	return User.read(await context.shard.blob.reqBuffer(`user/${user}/info`));
}

export async function saveUser(context: BackendContext, user: User.User) {
	await context.shard.blob.set(`user/${user.id}/info`, User.write(user));
}
