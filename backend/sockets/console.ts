import AnsiUp from 'ansi_up';
import * as Code from '~/engine/metadata/code';
import { Channel } from '~/storage/channel';
import { SubscriptionEndpoint } from '../socket';

const au = new AnsiUp();

export const ConsoleSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/console$/,

	async subscribe() {
		const channel = await Channel.connect<Code.ConsoleMessage>(`user/${this.user}/console`);
		return channel.listen(message => {
			if (message.type === 'console') {
				this.send(JSON.stringify({ messages: {
					log: message.log === undefined ? [] : [ au.ansi_to_html(message.log) ],
					results: message.result === undefined ? [] : [ au.ansi_to_html(message.result) ],
				} }));
			}
		});
	},
};
