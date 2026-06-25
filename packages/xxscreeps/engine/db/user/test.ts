import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import * as User from './index.js';

describe('User.remove', () => {
	test('removed user is no longer found', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '200', 'RemoveMe', [ { provider: 'email', id: 'remove@me.test' } ]);
		await User.remove(db, '200');
		assert.strictEqual(await User.findUserByName(db, 'RemoveMe'), null);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'remove@me.test'), null);
	});
});
