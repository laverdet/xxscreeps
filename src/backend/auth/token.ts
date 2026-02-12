import * as Crypto from 'crypto';
import config from 'xxscreeps/config/index.js';
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
	const key = new Uint8Array(secret());
	const hmac = Crypto.createHmac('sha3-224', key);
	const iv = Crypto.randomBytes(16);
	hmac.update(new Uint8Array(iv));
	const chunks = await new Promise<Uint8Array[]>((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		const cipher = Crypto.createCipheriv('aes-128-cbc', key, new Uint8Array(iv));
		cipher.on('data', chunk => {
			hmac.update(new Uint8Array(chunk));
			chunks.push(new Uint8Array(chunk));
		});
		cipher.on('end', () => resolve(chunks));
		cipher.on('error', error => reject(error));
		cipher.end(data);
	});
	return Buffer.concat([
		new Uint8Array(hmac.digest().subarray(0, 8)),
		new Uint8Array(iv),
		...chunks,
	]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decrypt(data: string) {
	const key = new Uint8Array(secret());
	const buffer = Buffer.from(data.replace(/-/g, '+').replace('_', '/'), 'base64');
	const hmac = Crypto.createHmac('sha3-224', key);
	hmac.update(new Uint8Array(buffer.subarray(8)));
	if (!hmac.digest().subarray(0, 8).equals(Uint8Array.from(buffer.subarray(0, 8)))) {
		return;
	}
	const chunks = await new Promise<Uint8Array[]>((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		const iv = new Uint8Array(buffer.subarray(8, 24));
		const cipher = Crypto.createDecipheriv('aes-128-cbc', key, iv);
		cipher.on('data', chunk => chunks.push(new Uint8Array(chunk)));
		cipher.on('end', () => resolve(chunks));
		cipher.on('error', error => reject(error));
		cipher.end(buffer.subarray(24));
	});
	return Buffer.concat(chunks);
}

export function makeToken(id: string) {
	const expires = Math.floor(Date.now() / 1000) + kTokenExpiry;
	if (/^[a-f0-9]+$/.test(id)) {
		// Hex only id
		const buffer = Buffer.alloc(5 + (id.length + 1 >>> 1), 0);
		const odd = id.length % 2;
		buffer.writeInt32LE(expires);
		buffer[4] = odd;
		buffer.write(`${odd === 0 ? '' : '0'}${id}`, 5, 'hex');
		return encrypt(buffer);
	} else {
		// Any string
		const payload = Buffer.from(id, 'utf8');
		const buffer = Buffer.alloc(4 + payload.length);
		buffer.writeInt32LE(-expires);
		buffer.set(payload, 4);
		return encrypt(buffer);
	}
}

export async function checkToken(token?: string) {
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
