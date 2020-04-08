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
					const code = Code.read(await this.context.blobStorage.load(`user/${this.user}/${message.id}`));
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
		const channel = await Channel.connect<RunnerUserMessage>(`user/${this.user}/runner`);
		return channel.listen(message => {
			if (message.type === 'push') {
				this.send(JSON.stringify({ activeName: 'activeWorld', branch: message.name }));
			}
		});
	},
};

export const CodeSubscriptions = [ /*CodeSubscription,*/ SetActiveBranchSubscription ];
