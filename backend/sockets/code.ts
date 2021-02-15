import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
// import { mapToKeys } from 'xxscreeps/util/utility';
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

	subscribe() {
		return getRunnerUserChannel(this.context.shard, this.user).listen(message => {
			if (message.type === 'code') {
				this.send(JSON.stringify({ activeName: 'activeWorld', branch: message.name }));
			}
		});
	},
};

export const CodeSubscriptions = [ /*CodeSubscription,*/ SetActiveBranchSubscription ];
