import type { Order } from './order.js';
import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps:mods/constants';
import { loadActiveOrders, loadUserOrders } from './model.js';

// An order as the client lists it: the fields `Game.market` exposes, with the id under `_id`, the
// client's spelling. The owner stays hidden here as it does there.
export function renderOrder(order: Order) {
	return {
		_id: order.id,
		active: order.active,
		amount: order.amount,
		created: order.created,
		createdTimestamp: order.createdTimestamp,
		price: order.price,
		remainingAmount: order.remainingAmount,
		resourceType: order.resourceType,
		roomName: order.roomName,
		totalAmount: order.totalAmount,
		type: order.type,
	};
}

// The market tab's resource list: how many orders are open on each side of every traded resource.
export function indexOrders(orders: Iterable<Order>) {
	return Fn.pipe(
		Fn.groupBy(orders, order => [ order.resourceType, order ] as const),
		$$ => Fn.map($$, ([ resourceType, group ]) => {
			const buying = Fn.accumulate(group, order => order.type === C.ORDER_BUY ? 1 : 0);
			return { _id: resourceType, buying, count: group.length, selling: group.length - buying };
		}),
		$$ => [ ...$$ ]);
}

// `GET /api/game/market/orders-index`
hooks.register('route', {
	path: '/api/game/market/orders-index',

	async execute(context) {
		return { ok: 1, list: indexOrders(await loadActiveOrders(context.shard)) };
	},
});

interface ResourceQuery {
	resourceType: string;
}

const resourceQuerySchema: JSONSchemaType<ResourceQuery> = {
	type: 'object',
	properties: {
		resourceType: { type: 'string' },
	},
	required: [ 'resourceType' ],
};

// `GET /api/game/market/orders?resourceType=energy` — the active orders in one resource; the page
// splits them by side and sorts them itself.
hooks.register('route', {
	path: '/api/game/market/orders',

	execute: makeValidatedQueryRoute(resourceQuerySchema, async context => {
		const { resourceType } = context.request.query;
		const orders = await loadActiveOrders(context.shard);
		return {
			ok: 1,
			list: Fn.pipe(
				orders,
				$$ => Fn.filter($$, order => order.resourceType === resourceType),
				$$ => Fn.map($$, renderOrder),
				$$ => [ ...$$ ]),
		};
	}),
});

// `GET /api/game/market/stats?resourceType=energy` — the price history the same page loads beside
// the orders. No trade is recorded yet, so it is empty.
hooks.register('route', {
	path: '/api/game/market/stats',

	execute() {
		return { ok: 1, stats: [] };
	},
});

// `GET /api/game/market/my-orders` — the player's own orders, active or not, oldest first.
hooks.register('route', {
	path: '/api/game/market/my-orders',

	async execute(context) {
		const { userId } = context.state;
		const orders = userId === undefined ? [] : await loadUserOrders(context.shard, userId);
		return {
			ok: 1,
			list: orders.sort(mappedNumericComparator(order => order.createdTimestamp)).map(renderOrder),
		};
	},
});
