import type { Code } from './code-schema';
import type { Database } from '../database';
import * as User from './user';
import { Channel } from 'xxscreeps/engine/storage/channel';
import { read, write } from './code-schema';

export const branchManifestKey = (userId: string) => `${User.infoKey(userId)}/branches`;
export const contentKey = (userId: string, branchName: string) => `${User.infoKey(userId)}/code/${branchName}`;

export function getUserCodeChannel(db: Database, userId: string) {
	type Message =
		{ type: 'switch'; branch: string } |
		{ type: 'update'; branch: string };
	return new Channel<Message>(db.pubsub, userId);
}

/**
 * Load the user's code and return as a blob for the runtime
 */
export async function loadBlob(db: Database, userId: string, branchName: string) {
	return db.blob.getBuffer(contentKey(userId, branchName));
}

/**
 * Load the user's code and parse into a readable format
 */
export async function loadContent(db: Database, userId: string, branchName: string) {
	const blob = await loadBlob(db, userId, branchName);
	return blob && read(blob);
}

/**
 * Update the user's code content and publish the change to runners
 */
export async function saveContent(db: Database, userId: string, branchName: string, content: Code) {
	const [ didSwitch ] = await Promise.all([
		db.data.hset(User.infoKey(userId), 'branch', branchName, { if: 'nx' }),
		db.data.sadd(branchManifestKey(userId), [ branchName ]),
		db.blob.set(contentKey(userId, branchName), write(content)),
	]);
	await getUserCodeChannel(db, userId).publish({ type: 'update', branch: branchName });
	if (didSwitch) {
		await getUserCodeChannel(db, userId).publish({ type: 'switch', branch: branchName });
	}
}
