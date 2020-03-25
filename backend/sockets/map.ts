import { Subscription } from '../socket';

export const mapSubscription: Subscription = {
	pattern: /^roomMap2:(?<room>[A-Z0-9]+)$/,

	subscribe: (connection, user, parameters) => {
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
		connection.write(`["roomMap2:${parameters.room}",{"w":[],"r":[],"pb":[],"p":[],"s":[],"c":[],"m":[],"k":[]}]`);
		return () => {};
	},
};
