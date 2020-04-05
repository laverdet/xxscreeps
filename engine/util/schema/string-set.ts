import { declare, vector } from '~/lib/schema';

export const format = declare(vector('string'), {
	compose: strings => new Set(strings),
	decompose: (set: Set<string>) => set,
});
