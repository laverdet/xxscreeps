import type { OrderType } from './order.js';
import type { OrderIntent } from './processor.js';
import type { Market } from 'xxscreeps/mods/classic/brokerage/market.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { intents } from 'xxscreeps/game/index.js';
import { StructureTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';
import { checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { checkOrderFee, checkOrderLimit, checkOrderParams } from './market.js';

declare module 'xxscreeps/mods/classic/brokerage/terminal.js' {
	interface StructureTerminal {
		'#orderIntents'?: OrderIntent[];

		/** Internal intent invoked by `market.createOrder` */
		'#createOrder': (market: Market, type: OrderType, resourceType: ResourceType, price: number, totalAmount: number) => ReturnType<typeof checkCreateOrder>;
	}
}

StructureTerminal.prototype['#createOrder'] =
	function(this: StructureTerminal, market: Market, type: OrderType, resourceType: ResourceType, price: number, totalAmount: number) {
		const millicredits = Math.round(price * 1000);
		const amount = Math.trunc(totalAmount);
		return chainIntentChecks(
			() => checkCreateOrder(this, market.credits * 1000, type, resourceType, millicredits, amount),
			() => {
				// The intent slot is unique per (object, action), so same-tick orders accumulate into a batch.
				const orderIntents = this['#orderIntents'] ??= [];
				orderIntents.push([ type, resourceType, millicredits, amount ]);
				return intents.save(this, 'createOrder', orderIntents);
			});
	};

export function checkCreateOrder(terminal: StructureTerminal, credits: number, type: OrderType, resourceType: ResourceType, price: number, totalAmount: number) {
	return chainIntentChecks(
		() => checkOrderParams(type, resourceType, price, totalAmount),
		() => checkOrderFee(credits, totalAmount, price),
		() => checkMyStructure(terminal, StructureTerminal),
		() => checkOrderLimit(),
	);
}
