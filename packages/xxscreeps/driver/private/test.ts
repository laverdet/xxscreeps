import * as assert from 'node:assert/strict';
import { describe, test } from 'xxscreeps/test/index.js';
import { isPrivate } from 'xxscreeps:private-symbol';

// nb: Run with:
// `npx xxscreeps test "driver/private" --private-transform=nodejs`
// - or -
// `npx xxscreeps test "driver/private" --private-transform=isolated-vm`
describe('driver/private', () => {
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

	test('inherited data property', () => {
		class One {
			'#foo' = 1;
			declare '#bar': number;
		}

		class Two extends One {}

		One.prototype['#bar'] = 1;
		Two.prototype['#bar'] = 2;
		assert.strictEqual(One.prototype['#bar'], 1);
		assert.strictEqual(Two.prototype['#bar'], 2);
		const instance = new Two();
		assert.strictEqual(instance['#bar'], 2);
		instance['#bar'] = 3;
		assert.strictEqual(instance['#bar'], 3);
		assert.strictEqual(Two.prototype['#bar'], 2);
		assert.strictEqual(instance['#foo'], 1);
	});

	test('optional chaining', () => {
		class Test {
			declare '#test': undefined | number;
			test() {
				const test = this['#test'] ??= 1;
				return test;
			}
		}

		const test = new Test();
		assert.strictEqual(test.test(), 1);
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
