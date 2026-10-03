import { assert, describe, test } from 'xxscreeps/test/index.js';
import { checkToken, makeToken, makeTokenSigner } from './token.js';

describe('backend/auth', () => {
	test('a login token round-trips', async () => {
		assert.strictEqual(await checkToken(await makeToken('abc123')), 'abc123');
		assert.strictEqual(await checkToken(await makeToken('new:abc123:steam:76561')), 'new:abc123:steam:76561');
	});

	test('a signed token round-trips for its own purpose only', async () => {
		const greeting = makeTokenSigner('greeting');
		const farewell = makeTokenSigner('farewell');
		const token = await greeting.make('hello', Date.now() + 60_000);
		assert.strictEqual(await greeting.read(token), 'hello');
		assert.strictEqual(await farewell.read(token), undefined);
	});

	test('an expired token is refused', async () => {
		const signer = makeTokenSigner('greeting');
		assert.strictEqual(await signer.read(await signer.make('hello', Date.now() - 1000)), undefined);
	});

	test('a signed token can never authenticate', async () => {
		// Every purpose signs under its own key, so this is what keeps a token minted for some other
		// purpose from being presented as a session token.
		const signer = makeTokenSigner('greeting');
		assert.strictEqual(await checkToken(await signer.make('hello', Date.now() + 60_000)), undefined);
		assert.strictEqual(await checkToken(await signer.make('abc123', Date.now() + 60_000)), undefined);
	});

	test('garbage is refused rather than thrown at', async () => {
		const signer = makeTokenSigner('greeting');
		assert.strictEqual(await checkToken('not-a-token'), undefined);
		assert.strictEqual(await signer.read(''), undefined);
	});
});
