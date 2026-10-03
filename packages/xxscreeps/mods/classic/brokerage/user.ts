import * as User from 'xxscreeps/engine/db/user/index.js';
import { removeTransactionEntries } from './model.js';

User.hooks.register('removeFromShard', removeTransactionEntries);
