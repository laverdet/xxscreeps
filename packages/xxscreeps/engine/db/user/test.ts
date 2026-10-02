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

describe('User.setEmail', () => {
	test('confirms the address outright when it is not held pending', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '300', 'AutoVerify');
		assert.deepStrictEqual(await User.setEmail(db, '300', 'auto@test.dev', false), { pending: false });
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'auto@test.dev'), '300');
		assert.strictEqual(await User.pendingEmailForUser(db, '300'), null);
	});

	test('holds pending then promotes on confirmation', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '301', 'Gated');
		assert.deepStrictEqual(await User.setEmail(db, '301', 'gated@test.dev', true), { pending: true });
		// Held pending: stored as pendingEmail, not yet a provider.
		assert.strictEqual(await User.pendingEmailForUser(db, '301'), 'gated@test.dev');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), null);
		// A mismatched address is rejected and changes nothing.
		assert.strictEqual(await User.verifyPendingEmail(db, '301', 'wrong@test.dev'), false);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), null);
		// Confirming the pending address promotes it to the `email` provider and clears pending.
		assert.strictEqual(await User.verifyPendingEmail(db, '301', 'gated@test.dev'), true);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), '301');
		assert.strictEqual(await User.pendingEmailForUser(db, '301'), null);
		// Opening a still-valid link again confirms what is already confirmed, rather than failing.
		assert.strictEqual(await User.verifyPendingEmail(db, '301', 'gated@test.dev'), true);
	});

	test('a pending address another account confirmed first is refused', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await Promise.all([ User.create(db, '302', 'First'), User.create(db, '303', 'Second') ]);
		await Promise.all([
			User.setEmail(db, '302', 'contested@test.dev', true),
			User.setEmail(db, '303', 'contested@test.dev', true),
		]);
		assert.strictEqual(await User.verifyPendingEmail(db, '302', 'contested@test.dev'), true);
		assert.strictEqual(await User.verifyPendingEmail(db, '303', 'contested@test.dev'), false);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'contested@test.dev'), '302');
	});
});
