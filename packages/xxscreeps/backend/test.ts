import type { EmailMessage, MailRefusal } from './mail.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { checkEmailVerificationToken, sendPendingEmailVerification } from './auth/email.js';
import { mailer } from './mail.js';

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

// Stands in for the transport a server installs, capturing what it was handed. A provider takes one
// implementation, so a test holds the slot for its own scope rather than for the whole run.
function backendMail(fixture: MailFixture = {}) {
	const { refusal, transport = true } = fixture;
	const sent: EmailMessage[] = [];
	const stack = new DisposableStack();
	// Always overridden, so a `publicUrl` in the developer's own config can't decide a test.
	stack.use(backendConfigForTesting('publicUrl',
		'publicUrl' in fixture ? fixture.publicUrl : 'https://screeps.test/'));
	if (transport) {
		stack.use(mailer.register({
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

describe('backend/mail', () => {
	test('a pending address is mailed a link which confirms it', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail();
		const { db } = testShard;
		await User.create(db, '400', 'Pending');
		await User.setEmail(db, '400', 'pending@test.dev', true);

		assert.strictEqual(await sendPendingEmailVerification(db, '400'), undefined);
		assert.strictEqual(mail.sent.length, 1);
		assert.strictEqual(mail.sent[0]!.to, 'pending@test.dev');

		// The link is rooted at `publicUrl` and carries a token good for exactly this address.
		const url = new URL(/https:\/\/\S+/.exec(mail.sent[0]!.text)![0]);
		assert.strictEqual(url.origin, 'https://screeps.test');
		assert.deepStrictEqual(await checkEmailVerificationToken(url.searchParams.get('token')!), {
			userId: '400',
			email: 'pending@test.dev',
		});

		// And opening it is what promotes the address.
		assert.strictEqual(await User.verifyPendingEmail(db, '400', 'pending@test.dev'), true);
		assert.strictEqual(await User.findUserByProvider(db, 'email', 'pending@test.dev'), '400');
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
		await User.setEmail(testShard.db, '402', 'throttled@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '402'),
			{ reason: 'throttled', retryInSeconds: 30 });
		assert.strictEqual(mail.sent.length, 0);
	});

	test('without a public url there is no link to mail', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail({ publicUrl: undefined });
		await User.create(testShard.db, '403', 'Rootless');
		await User.setEmail(testShard.db, '403', 'rootless@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '403'), { reason: 'no public url' });
		assert.strictEqual(mail.sent.length, 0);
	});

	test('with no transport installed every message is refused', async () => {
		await using testShard = await instantiateTestShard();
		using mail = backendMail({ transport: false });
		await User.create(testShard.db, '404', 'Unreachable');
		await User.setEmail(testShard.db, '404', 'unreachable@test.dev', true);
		assert.deepStrictEqual(await sendPendingEmailVerification(testShard.db, '404'), { reason: 'no mailer' });
		assert.strictEqual(mail.sent.length, 0);
	});
});
