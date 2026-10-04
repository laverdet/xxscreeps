import * as Crypto from 'node:crypto';
import * as Consumers from 'node:stream/consumers';
import { config } from 'xxscreeps/config/index.js';
import { runOnce } from 'xxscreeps/utility/memoize.js';

const secret = runOnce(() => {
	const { secret } = config.backend;
	if (secret) {
		return secret;
	} else {
		console.error('`backend.secret` is not set, this will cause login issues when restarting the server');
		return Crypto.randomBytes(16).toString('hex');
	}
});

interface OpenedToken {
	payload: string;
	/** When the token stops reading back (ms, as `Date.now()`). */
	expires: number;
}

interface TokenSigner {
	/** Mint a token carrying `payload`, which `read` hands back until `expires` (ms, as `Date.now()`). */
	make: (payload: string, expires: number) => Promise<string>;
	/**
	 * Open a token minted by `make` whether or not it has expired, or `undefined` if it is forged or
	 * someone else's. For telling a user their link is merely out of date; anything granting access
	 * goes through `read`.
	 */
	open: (token?: string) => Promise<OpenedToken | undefined>;
	/** Read back a token minted by `make`, or `undefined` if it is forged, expired, or someone else's. */
	read: (token?: string) => Promise<string | undefined>;
}

/**
 * Tokens for one `purpose`, signed with a key derived from `backend.secret` and the purpose, so a
 * token minted for one purpose never reads as another's. Deriving from the one secret is what lets
 * every kind of token survive a restart and work across backend replicas without shared storage.
 *
 * The purpose is a key, not a namespace: it is folded into the key material, so there is no way to
 * tell *which* purpose a foreign token was minted for, only that it was not this one.
 */
export function makeTokenSigner(purpose: string): TokenSigner {
	const key = runOnce(() => Crypto.createHmac('sha3-224', secret()).update(purpose).digest().subarray(0, 16));

	async function encrypt(data: Buffer) {
		const iv = Crypto.randomBytes(16);
		const cipher = Crypto.createCipheriv('aes-128-cbc', key(), iv);
		cipher.end(data);
		const encrypted = await Consumers.buffer(cipher);
		const hmac = Crypto.createHmac('sha3-224', key());
		hmac.update(iv);
		hmac.update(encrypted);
		return Buffer.concat([
			hmac.digest().subarray(0, 8),
			iv,
			encrypted,
		]).toString('base64url');
	}

	async function decrypt(data: string) {
		const buffer = Buffer.from(data, 'base64url');
		const hmac = Crypto.createHmac('sha3-224', key());
		hmac.update(buffer.subarray(8));
		if (!hmac.digest().subarray(0, 8).equals(buffer.subarray(0, 8))) {
			return;
		}
		const iv = buffer.subarray(8, 24);
		const cipher = Crypto.createDecipheriv('aes-128-cbc', key(), iv);
		cipher.end(buffer.subarray(24));
		return Consumers.buffer(cipher);
	}

	async function open(token?: string) {
		const buffer = await decrypt(token ?? '');
		if (!buffer) {
			return;
		}
		const time = buffer.readInt32LE();
		const payload = function() {
			if (time > 0) {
				// Hex only id
				const str = buffer.toString('hex', 5);
				return buffer[4] === 0 ? str : str.slice(1);
			} else {
				// Any string
				return buffer.toString('utf8', 4);
			}
		}();
		return { payload, expires: Math.abs(time) * 1000 };
	}

	return {
		make(payload, expires) {
			const expiresInSeconds = Math.floor(expires / 1000);
			if (/^[a-f0-9]+$/.test(payload)) {
				const buffer = Buffer.alloc(5 + (payload.length + 1 >>> 1), 0);
				const odd = payload.length % 2;
				buffer.writeInt32LE(expiresInSeconds);
				buffer[4] = odd;
				buffer.write(`${odd === 0 ? '' : '0'}${payload}`, 5, 'hex');
				return encrypt(buffer);
			} else {
				const buffer = Buffer.alloc(4 + Buffer.byteLength(payload, 'utf8'));
				buffer.writeInt32LE(-expiresInSeconds);
				buffer.write(payload, 4, 'utf8');
				return encrypt(buffer);
			}
		},

		open,

		async read(token) {
			const opened = await open(token);
			if (opened !== undefined && Date.now() <= opened.expires) {
				return opened.payload;
			}
		},
	};
}

// Session tokens. These are short-lived because the client refreshes them on every response.
const kTokenExpiry = 120 * 1000;
const { make, read } = makeTokenSigner('auth');

export function makeToken(id: string) {
	return make(id, Date.now() + kTokenExpiry);
}

export const checkToken = read;
