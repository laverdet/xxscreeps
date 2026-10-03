import type { EmailMessage, MailRefusal } from './mail.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { mailer } from './mail.js';
import { pendingEmailForUser, setEmail, verifyPendingEmail } from './model.js';
import { checkEmailVerificationToken, confirmEmailVerificationLink, sendPendingEmailVerification } from './verify.js';

/** Override one `backend` config value for the lifetime of the binding. */
function backendConfigForTesting<Key extends keyof typeof config.backend>(key: Key, value: typeof config.backend[Key]): Disposable {
	const previous = config.backend[key];
	config.backend[key] = value;
	return { [Symbol.dispose]() { config.backend[key] = previous; } };
}

interface MailFixture {
	/** Address the backend is reachable at, or nothing to leave it unconfigured. */
	publicUrl?: string | undefined;
	/** What the transport answers with, or nothing to have it accept and record the message. */
	refusal?: MailRefusal;
	/** Whether a transport is installed at all. */
	transport?: boolean;
}

// Stands in for the transport a server installs, capturing what it was handed.
function backendMail(fixture: MailFixture = {}) {
	const { refusal, transport = true } = fixture;
	const sent: EmailMessage[] = [];
	const stack = new DisposableStack();
	// Always overridden, so a `publicUrl` in the developer's own config can't decide a test.
	stack.use(backendConfigForTesting('publicUrl',
		'publicUrl' in fixture ? fixture.publicUrl : 'https://screeps.test/'));
	if (transport) {
		stack.use(mailer.overrideForTesting({
			send(message) {
				if (refusal !== undefined) {
					return refusal;
				}
				sent.push(message);
			},
		}));
	}
	return { sent, [Symbol.dispose]: () => stack.dispose() };
}

/** The token carried by the confirmation link in a mail the backend sent. */
function tokenFromMail(message: EmailMessage) {
	return new URL(/https:\/\/\S+/.exec(message.text)![0]).searchParams.get('token')!;
}

describe('mods/backend/email', () => {
	test('a pending address is mailed a link which confirms it', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail();
		const { db } = testShard;
		await User.create(db, '400', 'Pending');
		await setEmail(db, '400', 'pending@test.dev', true);

		assert.strictEqual(await sendPendingEmailVerification(db, '400'), undefined);
		assert.strictEqual(mail.sent.length, 1);
		assert.strictEqual(mail.sent[0]!.to, 'pending@test.dev');

		// The link is rooted at `publicUrl` and carries a token good for exactly this address.
		const url = new URL(/https:\/\/\S+/.exec(mail.sent[0]!.text)![0]);
		assert.strictEqual(url.origin, 'https://screeps.test');
		assert.deepStrictEqual(await checkEmailVerificationToken(url.searchParams.get('token')!), {
			userId: '400',
			email: 'pending@test.dev',
			expired: false,
		});

		// And opening it is what promotes the address.
		assert.strictEqual(await confirmEmailVerificationLink(db, url.searchParams.get('token')!), 'success');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'pending@test.dev'), '400');
	});

	test('a forged or missing link fails', async () => {
		await using testShard = await instantiateTestShard();
		assert.strictEqual(await confirmEmailVerificationLink(testShard.db, 'forged'), 'failed');
		assert.strictEqual(await confirmEmailVerificationLink(testShard.db, undefined), 'failed');
	});

	test('an expired link is reported as such and confirms nothing', async () => {
		await using testShard = await instantiateTestShard();
		using clock = new DeterministicClockForTesting();
		using mail = backendMail();
		const { db } = testShard;
		await User.create(db, '405', 'Late');
		await setEmail(db, '405', 'late@test.dev', true);
		await sendPendingEmailVerification(db, '405');
		clock.increment(2 * 60 * 60 * 1000);
		assert.strictEqual(await confirmEmailVerificationLink(db, tokenFromMail(mail.sent[0]!)), 'expired');
		assert.strictEqual(await pendingEmailForUser(db, '405'), 'late@test.dev');
	});

	test('a link for a replaced address is stale and confirms nothing', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail();
		const { db } = testShard;
		await User.create(db, '406', 'Fickle');
		await setEmail(db, '406', 'first@test.dev', true);
		await sendPendingEmailVerification(db, '406');
		await setEmail(db, '406', 'second@test.dev', true);
		assert.strictEqual(await confirmEmailVerificationLink(db, tokenFromMail(mail.sent[0]!)), 'stale');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'first@test.dev'), null);
		assert.strictEqual(await pendingEmailForUser(db, '406'), 'second@test.dev');
	});

	test('nothing is mailed to a user with no pending address', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail();
		await User.create(testShard.db, '401', 'Confirmed');
		assert.strictEqual(await sendPendingEmailVerification(testShard.db, '401'), undefined);
		assert.strictEqual(mail.sent.length, 0);
	});

	test('a refusal comes back to the caller', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail({ refusal: { reason: 'throttled', retryInSeconds: 30 } });
		await User.create(testShard.db, '402', 'Throttled');
		await setEmail(testShard.db, '402', 'throttled@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '402'),
			{ reason: 'throttled', retryInSeconds: 30 });
		assert.strictEqual(mail.sent.length, 0);
	});

	test('without a public url there is no link to mail', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail({ publicUrl: undefined });
		await User.create(testShard.db, '403', 'Rootless');
		await setEmail(testShard.db, '403', 'rootless@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '403'), { reason: 'no public url' });
		assert.strictEqual(mail.sent.length, 0);
	});

	test('with no transport installed every message is refused', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail({ transport: false });
		await User.create(testShard.db, '404', 'Unreachable');
		await setEmail(testShard.db, '404', 'unreachable@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '404'), { reason: 'no mailer' });
		assert.strictEqual(mail.sent.length, 0);
	});

	test('confirms the address outright when it is not held pending', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '300', 'AutoVerify');
		assert.deepStrictEqual(await setEmail(db, '300', 'auto@test.dev', false), { pending: false });
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'auto@test.dev'), '300');
		assert.strictEqual(await pendingEmailForUser(db, '300'), null);
	});

	test('holds pending then promotes on confirmation', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '301', 'Gated');
		assert.deepStrictEqual(await setEmail(db, '301', 'gated@test.dev', true), { pending: true });
		// Held pending: stored as pendingEmail, not yet a provider.
		assert.strictEqual(await pendingEmailForUser(db, '301'), 'gated@test.dev');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), null);
		// A mismatched address is rejected and changes nothing.
		assert.strictEqual(await verifyPendingEmail(db, '301', 'wrong@test.dev'), 'stale');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), null);
		// Confirming the pending address promotes it to the `email` provider and clears pending.
		assert.strictEqual(await verifyPendingEmail(db, '301', 'gated@test.dev'), 'confirmed');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'gated@test.dev'), '301');
		assert.strictEqual(await pendingEmailForUser(db, '301'), null);
		// Opening a still-valid link again confirms what is already confirmed, rather than failing.
		assert.strictEqual(await verifyPendingEmail(db, '301', 'gated@test.dev'), 'confirmed');
	});

	test('a pending address another account confirmed first is refused', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await Promise.all([ User.create(db, '302', 'First'), User.create(db, '303', 'Second') ]);
		await Promise.all([
			setEmail(db, '302', 'contested@test.dev', true),
			setEmail(db, '303', 'contested@test.dev', true),
		]);
		assert.strictEqual(await verifyPendingEmail(db, '302', 'contested@test.dev'), 'confirmed');
		assert.strictEqual(await verifyPendingEmail(db, '303', 'contested@test.dev'), 'taken');
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'contested@test.dev'), '302');
	});
});
