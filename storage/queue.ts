import { Responder, ResponderClient, ResponderHost } from './responder';

type Requests = {
	pop: undefined;
	push: string[];
};
type Responses = {
	pop: string | undefined;
	push: void;
};

export abstract class Queue {
	abstract pop(): Promise<string | undefined>;
	abstract push(entries: string[]): Promise<void>;

	static connect(name: string): Promise<Queue> {
		return Responder.connect<QueueHost, QueueClient>(name, QueueClient);
	}

	static create(name: string) {
		return ResponderHost.create(name, QueueHost);
	}
}

class QueueHost extends ResponderHost implements Queue {
	readonly queue: string[] = [];

	request(method: string): any;
	request(method: string, payload?: any) {
		if (method === 'pop') {
			return this.pop();
		} else if (method === 'push') {
			return this.push(payload);
		} else {
			return Promise.reject(new Error(`Unknown method: ${method}`));
		}
	}

	pop() {
		return Promise.resolve(this.queue.shift());
	}

	push(entries: string[]) {
		this.queue.push(...entries);
		return Promise.resolve();
	}
}

class QueueClient extends ResponderClient<Requests, Responses> implements Queue {
	pop() { return this.request('pop') }
	push(entries: string[]) { return this.request('push', entries) }
}
