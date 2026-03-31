import assert from 'node:assert';
import { shouldChargeAbortedTick } from 'xxscreeps/engine/runner/instance.js';
import { describe, test } from 'xxscreeps/test/context.js';

describe('Runner accounting', () => {
	test('setup-phase aborts do not charge user CPU', () => {
		assert.equal(shouldChargeAbortedTick('setup'), false);
	});

	test('runtime-phase aborts do charge user CPU', () => {
		assert.equal(shouldChargeAbortedTick('runtime'), true);
	});
});
