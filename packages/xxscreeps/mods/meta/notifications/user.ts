import * as User from 'xxscreeps/engine/db/user/index.js';
import { removeNotifyPrefs } from './prefs.js';

User.hooks.register('remove', removeNotifyPrefs);
