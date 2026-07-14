import * as User from 'xxscreeps/engine/db/user/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { checkPassword, setPassword } from './model.js';

describe('mod/backend/password', () => {
	test('set then check round-trips', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await User.create(db, '300', 'PwUser');
		await setPassword(db, '300', 'correct horse battery');
		assert.strictEqual(await checkPassword(db, '300', 'correct horse battery'), true);
		assert.strictEqual(await checkPassword(db, '300', 'wrong horse battery'), false);
	});
});
