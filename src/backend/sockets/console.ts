import AnsiUpModule from 'ansi_up';
// ansi_up's tsconfig is incorrect
const AnsiUp: typeof AnsiUpModule = (AnsiUpModule as any).default;
import { getConsoleChannel } from 'xxscreeps/engine/model/user';
import { SubscriptionEndpoint } from '../socket';

const au = new AnsiUp();
// Stupid hack to override client's CSS padding on console eval results
const colorize = (payload: string) => au.ansi_to_html(payload).replace(
	/<span style="(?<color>color:rgb\(\d+,\d+,\d+\))">/g,
	(_, color) => `<span style="padding:0;${color}">`,
);

export const ConsoleSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/console$/,

	async subscribe() {
		if (!this.user) {
			return () => {};
		}
		const channel = await getConsoleChannel(this.context.shard, this.user).subscribe();
		channel.listen(message => {
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
