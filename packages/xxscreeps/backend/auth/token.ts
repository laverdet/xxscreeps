import * as Crypto from 'node:crypto';
import * as Consumers from 'node:stream/consumers';
import { config } from 'xxscreeps/config/index.js';
import { runOnce } from 'xxscreeps/utility/memoize.js';

const secret = runOnce(() => {
	const { secret } = config.backend;
	if (secret) {
		return Crypto.createHmac('sha3-224', secret).digest().subarray(0, 16);
	} else {
		console.error('`backend.secret` is not set, this will cause login issues when restarting the server');
		return Crypto.randomBytes(16);
	}
});

const kTokenExpiry = 120;

async function encrypt(data: string | Buffer) {
	const key = secret();
	const iv = Crypto.randomBytes(16);
	const cipher = Crypto.createCipheriv('aes-128-cbc', key, iv);
	cipher.end(data);
	const encrypted = await Consumers.buffer(cipher);
	const hmac = Crypto.createHmac('sha3-224', key);
	hmac.update(iv);
	hmac.update(encrypted);
	return Buffer.concat([
		hmac.digest().subarray(0, 8),
		iv,
		encrypted,
	]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decrypt(data: string) {
	const key = secret();
	const buffer = Buffer.from(data.replace(/-/g, '+').replace('_', '/'), 'base64');
	const hmac = Crypto.createHmac('sha3-224', key);
	hmac.update(buffer.subarray(8));
	if (!hmac.digest().subarray(0, 8).equals(buffer.subarray(0, 8))) {
		return;
	}
	const iv = buffer.subarray(8, 24);
	const cipher = Crypto.createDecipheriv('aes-128-cbc', key, iv);
	cipher.end(buffer.subarray(24));
	return Consumers.buffer(cipher);
}

// Purpose tag separator. Login payloads are a user id or a `new:...` triplet, neither of which can
// contain a nul byte, so the tag is what keeps the two token kinds apart in one key space.
const kPurposeSeparator = '\0';

function makeStringToken(payload: string, expiresInSeconds: number) {
	const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
	const buffer = Buffer.alloc(4 + Buffer.byteLength(payload, 'utf8'));
	buffer.writeInt32LE(-expires);
	buffer.write(payload, 4, 'utf8');
	return encrypt(buffer);
}

export function makeToken(id: string) {
	if (/^[a-f0-9]+$/.test(id)) {
		// Hex only id
		const expires = Math.floor(Date.now() / 1000) + kTokenExpiry;
		const buffer = Buffer.alloc(5 + (id.length + 1 >>> 1), 0);
		const odd = id.length % 2;
		buffer.writeInt32LE(expires);
		buffer[4] = odd;
		buffer.write(`${odd === 0 ? '' : '0'}${id}`, 5, 'hex');
		return encrypt(buffer);
	} else {
		// Any string
		return makeStringToken(id, kTokenExpiry);
	}
}

async function readToken(token?: string) {
	const buffer = await decrypt(token ?? '');
	if (!buffer) {
		return;
	}
	const time = buffer.readInt32LE();
	if (Date.now() / 1000 > Math.abs(time)) {
		return;
	}
	if (time > 0) {
		// Hex only id
		const str = buffer.toString('hex', 5);
		return buffer[4] === 0 ? str : str.substr(1);
	} else {
		// Any string
		return buffer.toString('utf8', 4);
	}
}

export async function checkToken(token?: string) {
	const value = await readToken(token);
	// Purpose-tagged tokens share the signing key but must never authenticate a request.
	return value?.includes(kPurposeSeparator) ? undefined : value;
}

/**
 * Mint a token which carries `payload` for a named `purpose` other than authentication — e.g. the
 * address confirmation link mailed to a user. Signed with the same key as login tokens, so links
 * survive a restart and work across backend replicas without shared storage, but tagged with the
 * purpose so the two can never be exchanged for one another.
 */
export function makeSignedToken(purpose: string, payload: string, expiresInSeconds: number) {
	return makeStringToken(`${purpose}${kPurposeSeparator}${payload}`, expiresInSeconds);
}

/**
 * Read back a token minted by `makeSignedToken`, or `undefined` if it's invalid, expired, or was
 * minted for another purpose.
 */
export async function checkSignedToken(purpose: string, token?: string) {
	const value = await readToken(token);
	const prefix = `${purpose}${kPurposeSeparator}`;
	return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}
