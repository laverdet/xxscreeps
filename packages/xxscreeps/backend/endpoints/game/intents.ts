import type { Endpoint } from 'xxscreeps/backend/index.js';
import { JSONSchemaType } from 'ajv';
import { makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';

interface IntentRequest {
	id: string;
}

const intentSchema: JSONSchemaType<IntentRequest> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
	},
	required: [ 'id' ],
};

interface AddObjectIntentRequest {
	room: string;
	name: string;
	intent: IntentRequest | IntentRequest[];
}

const addObjectIntentSchema: JSONSchemaType<AddObjectIntentRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
		name: { type: 'string' },
		intent: {
			anyOf: [
				{
					type: 'array',
					items: intentSchema,
					minItems: 1,
				},
				intentSchema,
			],
		},
	},
	required: [ 'room', 'name', 'intent' ],
};

const AddObjectIntentEndpoint: Endpoint = {
	method: 'post',
	path: '/api/game/add-object-intent',

	execute: makeValidatedPayloadRoute(addObjectIntentSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return;
		}
		const { room, name, intent } = context.request.body;
		const { id } = Array.isArray(intent) ? intent[0] : intent;
		const realIntentName = {
			removeConstructionSite: 'remove',
		}[name] ?? name;
		await pushIntentsForRoomNextTick(context.shard, room, userId, {
			local: {},
			object: {
				[id]: { [realIntentName]: [] },
			},
		});
		return { ok: 1 };
	}),
};

const endpoints = [ AddObjectIntentEndpoint ];
export default endpoints;
