import type { SubscriptionEndpoint } from '../socket';
import AnsiUpModule from 'ansi_up';
// ansi_up's tsconfig is incorrect
const AnsiUp: typeof AnsiUpModule = (AnsiUpModule as any).default;
import { getConsoleChannel } from 'xxscreeps/engine/model/user';

const au = new AnsiUp();
// Stupid hack to override client's CSS padding on console eval results
const colorize = (payload: string) => au.ansi_to_html(payload).replace(
	/<span style="(?<style>(?:background-color|color|font-weight):[^";]+?;?)+">/g,
	(_, style) => `<span style="padding:0;${style}">`,
).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const ConsoleSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/console$/,

	async subscribe() {
		if (!this.user) {
			return () => {};
		}
		let throttleTime = 0;
		let throttleCount = 0;
		const channel = await getConsoleChannel(this.context.shard, this.user).subscribe();
		channel.listen(message => {
			const now = Date.now();
			if (now > throttleTime) {
				throttleCount = 0;
				throttleTime = now + 1000;
			}
			if (++throttleCount === 20) {
				this.send(JSON.stringify({ error: 'Throttling console messages' }));
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
		return () => channel.disconnect();
	},
};
