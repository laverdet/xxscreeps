import { assert, describe, test } from 'xxscreeps/test/index.js';
import { checkSignedToken, checkToken, makeSignedToken, makeToken } from './token.js';

describe('auth tokens', () => {
	test('a login token round-trips', async () => {
		assert.strictEqual(await checkToken(await makeToken('abc123')), 'abc123');
		assert.strictEqual(await checkToken(await makeToken('new:abc123:steam:76561')), 'new:abc123:steam:76561');
	});

	test('a signed token round-trips for its own purpose only', async () => {
		const token = await makeSignedToken('greeting', 'hello', 60);
		assert.strictEqual(await checkSignedToken('greeting', token), 'hello');
		assert.strictEqual(await checkSignedToken('farewell', token), undefined);
	});

	test('an expired token is refused', async () => {
		assert.strictEqual(await checkSignedToken('greeting', await makeSignedToken('greeting', 'hello', -1)), undefined);
	});

	test('a signed token can never authenticate', async () => {
		// Both kinds share the signing key, so this is what keeps a token minted for some other
		// purpose from being presented as a session token.
		assert.strictEqual(await checkToken(await makeSignedToken('greeting', 'hello', 60)), undefined);
	});

	test('garbage is refused rather than thrown at', async () => {
		assert.strictEqual(await checkToken('not-a-token'), undefined);
		assert.strictEqual(await checkSignedToken('greeting', ''), undefined);
	});
});
