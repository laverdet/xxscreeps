import { registerStorageProvider } from 'xxscreeps/engine/db/storage';
import { RedisProvider } from './keyval';
import { RedisPubSubProvider } from './pubsub';

registerStorageProvider('redis', 'keyval', url => RedisProvider.connect(url));
registerStorageProvider('redis', 'pubsub', url => RedisPubSubProvider.connect(url));
