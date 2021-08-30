/* eslint-disable no-control-regex */
import type { SubscriptionEndpoint } from '../socket';
import { getConsoleChannel, getUsageChannel } from 'xxscreeps/engine/runner/model';
import config from 'xxscreeps/config';
import { throttle } from 'xxscreeps/utility/utility';
import { resultPrefix } from 'xxscreeps/driver/runtime/print';

function colorize(payload: string) {
	return `${payload}`
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
		return getConsoleChannel(this.context.shard, params.user).listen(message => {
			type Frame = {
				error?: never;
				messages: { log: string[]; results: string[] };
			} | {
				error: string;
				messages?: never;
			};
			const frames: Frame[] = [];
			const lines = JSON.parse(message);

			for (const line of lines) {
				if (line.fd === 1) {
					if (line.data.startsWith(resultPrefix)) {
						if (frames[frames.length - 1]?.messages?.results.length) {
							// Eval response
							frames[frames.length - 1].messages!.results.push(colorize(line.data.substr(resultPrefix.length)));
						} else {
							// Repeated eval response
							frames.push({ messages: { log: [], results: [ colorize(line.data.substr(resultPrefix.length)) ] } });
						}
					} else if (frames[frames.length - 1]?.messages?.log.length) {
						// console.log
						frames[frames.length - 1].messages!.log.push(colorize(line.data));
					} else {
						// Repeated console.log
						frames.push({ messages: { log: [ colorize(line.data) ], results: [] } });
					}
				} else {
					// Error
					frames.push({ error: colorize(line.data) });
				}
			}
			for (const frame of frames) {
				this.send(JSON.stringify(frame));
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
