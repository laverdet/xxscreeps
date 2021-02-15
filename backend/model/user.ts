import { BackendContext } from 'xxscreeps/backend/context';
import * as User from 'xxscreeps/engine/metadata/user';

export async function loadUser(context: BackendContext, user: string) {
	return User.read(await context.persistence.get(`user/${user}/info`));
}

export async function saveUser(context: BackendContext, user: User.User) {
	await context.persistence.set(`user/${user.id}/info`, User.write(user));
}
