import { BackendContext } from '~/backend/context';
import * as User from '~/engine/metadata/user';

export async function loadUser(context: BackendContext, user: string) {
	return User.read(await context.blobStorage.load(`user/${user}/info`));
}

export async function saveUser(context: BackendContext, user: User.User) {
	await context.blobStorage.save(`user/${user.id}/info`, User.write(user));
}
