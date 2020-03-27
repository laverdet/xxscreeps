import { checkCast, makeEnum, makeVector, withType, Format, Interceptor } from '~/lib/schema';
import * as C from '~/game/constants';
import { Amount, Capacity, Resources, Restricted, SingleResource, Store } from '~/game/store';

export { Store };

export const resourceEnumFormat = makeEnum(undefined, ...C.RESOURCES_ALL);

export const storedResourceFormat = checkCast<Format>()(makeVector({
	amount: 'int32',
	capacity: 'int32',
	type: resourceEnumFormat,
}));

export const format = withType<Store>(checkCast<Format>()({
	amount: 'int32',
	capacity: 'int32',
	resources: storedResourceFormat,
	restricted: 'bool',
	singleResource: resourceEnumFormat,
}));

export const interceptors = {
	Store: checkCast<Interceptor>()({
		members: {
			amount: { symbol: Amount },
			capacity: { symbol: Capacity },
			resources: { symbol: Resources },
			restricted: { symbol: Restricted },
			singleResource: { symbol: SingleResource },
		},
		overlay: Store,
	}),
};

export const schemaFormat = { Store: format };
