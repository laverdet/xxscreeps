import * as User from 'xxscreeps/engine/db/user/index.js';
import { removeAllForUser } from './model.js';

User.hooks.register('remove', removeAllForUser);
