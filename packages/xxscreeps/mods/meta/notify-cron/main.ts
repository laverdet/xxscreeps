import { everyNTicks, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pruneExpiredNotifications } from './model.js';

registerShardTickProcessor(everyNTicks(100, shard => pruneExpiredNotifications(shard, Date.now())));
