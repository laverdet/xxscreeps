import { registerStorageProvider } from 'xxscreeps/engine/db/storage';
import { RedisProvider } from './keyval';
import { RedisPubSubProvider } from './pubsub';

registerStorageProvider('redis', [ 'blob', 'keyval' ], async(url, disposition) =>
	RedisProvider.connect(url, disposition === 'blob'));

registerStorageProvider('redis', 'pubsub', async url =>
	RedisPubSubProvider.connect(url));
