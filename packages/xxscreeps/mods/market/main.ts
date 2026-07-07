import { registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { expireOrphanedOrders } from './model.js';

// Orders are maintained by their owning terminal's room pass; this global pass only expires orders
// whose room never processes, without loading any room.
registerShardTickProcessor(shard => expireOrphanedOrders(shard));
