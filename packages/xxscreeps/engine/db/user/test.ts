import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import * as Badge from './badge.js';
import * as User from './index.js';

describe('Badge.generateRandom', () => {
	test('always produces a schema-valid badge', () => {
		// A colour channel below 0x100000 renders as fewer than six hex digits; without
		// zero-padding that fails the `^#[a-f0-9]{6}$` schema (~1/16 per channel), so loop
		// enough times to surface it. validate() throws on a malformed badge.
		for (let index = 0; index < 256; ++index) {
			const badge = Badge.generateRandom();
			assert.strictEqual(Badge.validate(badge), badge);
		}
	});
});

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
