import { compose, vector } from 'xxscreeps/schema';

export const format = compose(vector('string'), {
	compose: strings => new Set(strings),
	decompose: (set: Set<string>) => set,
});
