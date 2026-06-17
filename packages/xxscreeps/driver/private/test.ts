import * as assert from 'node:assert/strict';
import { describe, test } from 'xxscreeps/test/index.js';
import { isPrivate } from 'xxscreeps:private-symbol';

// nb: Run with:
// `npx xxscreeps test "#private" --private-transform=nodejs`
// - or -
// `npx xxscreeps test "#private" --private-transform=isolated-vm`
describe('#private', () => {
	test('super invocations', () => {
		class One {
			'#foo'() { return '1'; }
		}

		class Two extends One {
			override '#foo'() {
				return '2' + super['#foo']();
			}
		}

		class Three extends Two {
			override '#foo'() {
				return '3' + super['#foo']();
			}
		}

		const instance = new Three();
		assert.strictEqual(instance['#foo'](), '321');
	});

	test('monkey patch', () => {
		class One {
			'#foo'() { return '1'; }
		}

		class Two extends One {
			override '#foo'() { return '2' + super['#foo'](); }
		}

		Two.prototype['#foo'] = function(impl) {
			return function(this: Two) {
				return '3' + impl.call(this);
			};
		}(Two.prototype['#foo']);

		const instance = new Two();
		assert.strictEqual(instance['#foo'](), '321');
	});

	if (isPrivate) {
		test('private symbol', () => {
			class Test {
				'#foo'() { return '1'; }
			}
			for (
				let subject: object | null = Test.prototype;
				subject != null;
				subject = Reflect.getPrototypeOf(subject)
			) {
				for (const key of Reflect.ownKeys(subject)) {
					assert.ok(typeof key !== 'symbol');
					assert.ok(!key.startsWith('#'));
				}
			}
		});
	}
});
