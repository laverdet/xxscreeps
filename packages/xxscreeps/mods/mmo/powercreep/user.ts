import * as User from 'xxscreeps/engine/db/user/index.js';
import { removeRoster } from './model.js';

User.hooks.register('remove', removeRoster);
