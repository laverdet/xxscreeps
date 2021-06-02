import { registerStorageProvider } from 'xxscreeps/engine/db/storage';
import { RedisProvider } from './keyval';
import { RedisPubSubProvider } from './pubsub';

registerStorageProvider('redis', [ 'blob', 'keyval' ], async(url, disposition) => {
	const client = await RedisProvider.connect(url, disposition === 'blob');
	return [ () => client.disconnect(), client ];
});
registerStorageProvider('redis', 'pubsub', async url => {
	const client = await RedisPubSubProvider.connect(url);
	return [ () => client.disconnect(), client ];
});
