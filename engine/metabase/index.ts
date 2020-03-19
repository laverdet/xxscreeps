import { getSchema } from '~/engine/schema/format';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';
import * as Code from './code';
import * as Game from './game';
import * as User from './user';

export const schemaFormat = {
	Code: Code.format,
	User: User.format,
	Game: Game.format,
};

export const schema = getSchema(schemaFormat);

export const interceptorSchema = bindInterceptorsToSchema(schema, {
	Game: Game.interceptors,
	User: User.interceptors,
});
