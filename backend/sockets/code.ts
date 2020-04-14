import { RunnerUserMessage } from '~/engine/service/runner';
// import { mapToKeys } from '~/lib/utility';
import { Channel } from '~/storage/channel';
import { SubscriptionEndpoint } from '../socket';

/*
const CodeSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/code$/,

	async subscribe() {
		const channel = await Channel.connect<Code.Message>(`code/${this.user}`);
		return channel.listen(message => {
			 (async() => {
				if (message.type === 'branch') {
					const code = Code.read(await this.context.persistence.load(`user/${this.user}/${message.id}`));
					this.send(JSON.stringify({
						branch: message.name,
						modules: mapToKeys(code.modules),
						timestamp: Date.now(),
					}));
				}
			})().catch(console.error);
		});
	},
};
*/

const SetActiveBranchSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/set-active-branch$/,

	async subscribe() {
		const channel = await new Channel<RunnerUserMessage>(this.context.storage, `user/${this.user}/runner`).subscribe();
		channel.listen(message => {
			if (message.type === 'push') {
				this.send(JSON.stringify({ activeName: 'activeWorld', branch: message.name }));
			}
		});
		return () => channel.disconnect();
	},
};

export const CodeSubscriptions = [ /*CodeSubscription,*/ SetActiveBranchSubscription ];
