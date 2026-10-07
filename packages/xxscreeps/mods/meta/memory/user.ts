import * as User from 'xxscreeps/engine/db/user/index.js';
import { deleteUserMemory } from './model.js';

User.hooks.register('removeFromShard', deleteUserMemory);
