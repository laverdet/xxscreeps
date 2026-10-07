import * as User from 'xxscreeps/engine/db/user/index.js';
import { removeLastNotifyDate, removeUserNotifications } from './model.js';

User.hooks.register('remove', removeLastNotifyDate);
User.hooks.register('removeFromShard', removeUserNotifications);
