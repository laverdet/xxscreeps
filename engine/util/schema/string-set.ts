import { bindInterceptors, makeVector } from '~/lib/schema';

export const format = bindInterceptors(makeVector('string'), {
	compose: strings => new Set(strings),
	decompose: (set: Set<string>) => set,
});
