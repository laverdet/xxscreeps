import * as User from 'xxscreeps/engine/db/user/index.js';
import { saveUserFlagBlobForNextTick } from './model.js';

// Saving no blob deletes the user's flags, as the respawn route does
User.hooks.register('removeFromShard', (shard, userId) => saveUserFlagBlobForNextTick(shard, userId));
