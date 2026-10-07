import * as User from 'xxscreeps/engine/db/user/index.js';
import { deleteOrdersForUser } from './model.js';

User.hooks.register('removeFromShard', deleteOrdersForUser);
