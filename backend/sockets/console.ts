import AnsiUp from 'ansi_up';
import { UserConsoleMessage } from '~/engine/service/runner';
import { Channel } from '~/storage/channel';
import { SubscriptionEndpoint } from '../socket';

const au = new AnsiUp();

export const ConsoleSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/console$/,

	async subscribe() {
		const channel = await Channel.connect<UserConsoleMessage>(`user/console/${this.user}`);
		return channel.listen(message => {
			if (message.type === 'console') {
				this.send(JSON.stringify({ messages: {
					log: [ au.ansi_to_html(message.payload) ],
					results: [],
				} }));
			}
		});
	},
};
