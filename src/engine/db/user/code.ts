import type { Database } from 'xxscreeps/engine/db';
import * as Fn from 'xxscreeps/utility/functional';
import * as Schema from './code-schema';
import * as User from '.';
import { Channel } from 'xxscreeps/engine/db/channel';

export const branchManifestKey = (userId: string) => `${User.infoKey(userId)}/branches`;
export const buffersKey = (userId: string, branchName: string) =>
	`${User.infoKey(userId)}/bins/${branchName.replace(/[^a-zA-Z0-9_]/g, char => `-${char.charCodeAt(0).toString(36)}`)}`;
export const stringsKey = (userId: string, branchName: string) =>
	`${User.infoKey(userId)}/code/${branchName.replace(/[^a-zA-Z0-9_]/g, char => `-${char.charCodeAt(0).toString(36)}`)}`;

export function getUserCodeChannel(db: Database, userId: string) {
	type Message =
		{ type: 'switch'; branch: string } |
		{ type: 'update'; branch: string };
	return new Channel<Message>(db.pubsub, userId);
}

export type CodePayload = Map<string, string | Uint8Array>;

/**
 * Load the user's code and return as a blob for the runtime
 */
export async function loadBlobs(db: Database, userId: string, branchName: string): Promise<Schema.CodeBlobs | undefined> {
	const [ buffers, strings ] = await Promise.all([
		db.data.get(buffersKey(userId, branchName), { blob: true }),
		db.data.get(stringsKey(userId, branchName), { blob: true }),
	]);
	if (buffers || strings) {
		return { buffers, strings };
	}
}

/**
 * Load the user's code and parse into a readable format
 */
export async function loadContent(db: Database, userId: string, branchName: string) {
	const blobs = await loadBlobs(db, userId, branchName);
	if (blobs) {
		return Schema.read(blobs);
	}
}

/**
 * Update the user's code content and publish the change to runners
 */
export async function saveContent(db: Database, userId: string, branchName: string, content: CodePayload) {
	const [ strings, buffers ] = Fn.bifurcate(content,
		(entry): entry is [ string, string ] => typeof entry[1] === 'string');
	const bufferBlob = buffers.length === 0 ? undefined : Schema.writeBuffers(new Map(buffers as [ string, Uint8Array ][]));
	const stringBlob = strings.length === 0 ? undefined : Schema.writeStrings(new Map(strings));
	const [ didSwitch ] = await Promise.all([
		db.data.hset(User.infoKey(userId), 'branch', branchName, { if: 'nx' }),
		db.data.sadd(branchManifestKey(userId), [ branchName ]),
		bufferBlob ?
			db.data.set(buffersKey(userId, branchName), bufferBlob) :
			db.data.vdel(buffersKey(userId, branchName)) as Promise<never>,
		stringBlob ?
			db.data.set(stringsKey(userId, branchName), stringBlob) :
			db.data.vdel(stringsKey(userId, branchName)) as Promise<never>,
	]);
	await getUserCodeChannel(db, userId).publish({ type: 'update', branch: branchName });
	if (didSwitch) {
		await getUserCodeChannel(db, userId).publish({ type: 'switch', branch: branchName });
	}
}
