/* eslint-disable no-control-regex */
import type { SubscriptionEndpoint } from '../socket';
import { getConsoleChannel, getUsageChannel } from 'xxscreeps/engine/runner/model';
import { throttle } from 'xxscreeps/utility/utility';
import config from 'xxscreeps/config';

function colorize(payload: string) {
	return payload
		// null
		.replace(/\x1b\[1m/g, '<b>')
		.replace(/\x1b\[22m/g, '</b>')
		// undefined
		.replace(/\x1b\[90m/g, '<span style="padding:0;color:#999">')
		// yellow - number, boolean
		.replace(/\x1b\[33m/g, '<span style="padding:0;color:#bb0">')
		// green - string, symbol
		.replace(/\x1b\[32m/g, '<span style="padding:0;color:#0b0">')
		// magenta - date
		.replace(/\x1b\[35m/g, '<span style="padding:0;color:#b0b">')
		// red - regexp
		.replace(/\x1b\[31m/g, '<span style="padding:0;color:#b00">')
		// cyan - regexp
		.replace(/\x1b\[36m/g, '<span style="padding:0;color:#0bb">')
		// generic reset
		.replace(/\x1b\[39m/g, '</span>')
		// underline - module [unused]
		.replace(/\x1b\[4/g, '<u>')
		.replace(/\x1b\[24m/g, '</u>');
}

const ConsoleSubscription: SubscriptionEndpoint = {
	pattern: /^user:(?<user>[^/]+)\/console$/,

	subscribe(params) {
		if (!this.user || params.user !== this.user) {
			return () => {};
		}
		let throttleTime = 0;
		let throttleCount = 0;
		return getConsoleChannel(this.context.shard, params.user).listen(message => {
			const now = Date.now();
			if (now > throttleTime) {
				throttleCount = 0;
				throttleTime = now + 1000;
			}
			if (++throttleCount >= 20) {
				if (throttleCount === 20) {
					this.send(JSON.stringify({ error: 'Throttling console messages' }));
				}
				return;
			}
			switch (message.type) {
				case 'error':
					this.send(JSON.stringify({ error: colorize(message.value) }));
					break;
				case 'log':
					this.send(JSON.stringify({ messages: { log: [ colorize(message.value) ], results: [] } }));
					break;
				case 'result':
					this.send(JSON.stringify({ messages: { log: [], results: [ colorize(message.value) ] } }));
					break;
				default:
			}
		});
	},
};

const UsageSubscription: SubscriptionEndpoint = {
	pattern: /^user:(?<user>[^/]+)\/cpu$/,

	async subscribe(params) {
		if (!this.user || params.user !== this.user) {
			return () => {};
		}
		const usage: any = {};
		const send = throttle(() => {
			this.send(JSON.stringify(usage));
		});
		const subscription = await getUsageChannel(this.context.shard, params.user).listen(message => {
			Object.assign(usage, message);
			usage.cpu = Math.floor(usage.cpu);
			send.set(config.backend.socketThrottle);
		});
		return () => {
			subscription();
			send.clear();
		};
	},
};

export const ConsoleSubscriptions = [ ConsoleSubscription, UsageSubscription ];
