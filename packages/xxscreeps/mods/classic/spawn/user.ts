import * as User from 'xxscreeps/engine/db/user/index.js';

// The respawn throttle's timestamp, kept per shard on a hash which shares the account's key
User.hooks.register('removeFromShard', async (shard, userId) => {
	await shard.data.hDel(User.infoKey(userId), [ 'lastSpawnTime' ]);
});
