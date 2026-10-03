import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import * as Badge from './badge.js';
import * as User from './index.js';

describe('engine/db/user', () => {
	test('Badge.generateRandom produces a schema-valid badge', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		// A color channel below 0x100000 renders as fewer than six hex digits; without
		// zero-padding that fails the `^#[a-f0-9]{6}$` schema (~1/16 per channel), so loop
		// enough times to surface it. validate() throws on a malformed badge.
		for (let index = 0; index < 256; ++index) {
			const badge = Badge.generateRandom();
			assert.strictEqual(await Badge.validate(db, '100', badge), badge);
		}
	});

	test('an address is found from either side, however it was capitalized', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '400', 'MailUser', [ { provider: User.emailProvider, id: 'Mail@User.test' } ]);
		assert.strictEqual(await User.findUserByEmail(db, 'mail@user.test'), '400');
		assert.strictEqual(await User.findUserByEmail(db, 'MAIL@USER.TEST'), '400');
		assert.strictEqual(await User.emailForUser(db, '400'), 'mail@user.test');
	});

	test('an address another account holds cannot be registered under a different case', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '401', 'FirstUser', [ { provider: User.emailProvider, id: 'shared@user.test' } ]);
		await assert.rejects(() => User.create(db, '402', 'SecondUser',
			[ { provider: User.emailProvider, id: 'Shared@User.test' } ]));
	});

	test('an account registered without an address has none', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '403', 'PlainUser');
		assert.strictEqual(await User.emailForUser(db, '403'), null);
		assert.strictEqual(await User.findUserByEmail(db, 'mail@user.test'), null);
	});

	test('checkEmail takes an address in any case and rejects a username', () => {
		assert.strictEqual(User.checkEmail('mail@user.test'), true);
		assert.strictEqual(User.checkEmail('John.Doe@Example.com'), true);
		assert.strictEqual(User.checkEmail('MailUser'), false);
		assert.strictEqual(User.checkEmail(`${'long'.repeat(64)}@user.test`), false);
	});

	test('removed user is no longer found', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '200', 'RemoveMe', [ { provider: 'email', id: 'remove@me.test' } ]);
		await User.remove(db, '200');
		assert.strictEqual(await User.findUserByName(db, 'RemoveMe'), null);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'remove@me.test'), null);
	});
});
