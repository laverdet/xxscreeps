import AnsiUpModule from 'ansi_up';
// ansi_up's tsconfig is incorrect
const AnsiUp: typeof AnsiUpModule = (AnsiUpModule as any).default;
import * as Code from 'xxscreeps/engine/metadata/code';
import { Channel } from 'xxscreeps/storage/channel';
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
		const channel = await new Channel<Code.ConsoleMessage>(this.context.storage, `user/${this.user}/console`).subscribe();
		channel.listen(message => {
			if (message.type === 'console') {
				this.send(JSON.stringify({ messages: {
					log: message.log === undefined ? [] : [ colorize(message.log) ],
					results: message.result === undefined ? [] : [ colorize(message.result) ],
				} }));
			}
		});
		return () => channel.disconnect();
	},
};
