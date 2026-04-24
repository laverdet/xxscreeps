// I'll write a leaner version of this one day. But not today.
// @ts-expect-error
import lodash_es from 'lodash-es';

const lodash = lodash_es as typeof import('lodash');
// eslint-disable-next-line @typescript-eslint/unbound-method
export const iteratee = lodash.iteratee;
