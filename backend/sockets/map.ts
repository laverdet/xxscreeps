import { SubscriptionEndpoint } from '../socket';

export const mapSubscription: SubscriptionEndpoint = {
	pattern: /^roomMap2:(?<room>[A-Z0-9]+)$/,

	subscribe() {
		// w: constructedWall
		// r: road
		// pb: powerBank
		// p: portal
		// s: source
		// m: mineral
		// d: deposit
		// c: controller
		// k: keeperLair
		// e: energy | power
		this.send('{"w":[],"r":[],"pb":[],"p":[],"s":[],"c":[],"m":[],"k":[]}');
		return () => {};
	},
};
