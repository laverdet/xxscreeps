import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import { StructureExtension } from '~/game/objects/structures/extension';
import * as Store from './store';
import * as Structure from './structure';

export { StructureExtension };

export const format = withType<StructureExtension>(checkCast<Format>()({
	[Inherit]: Structure.format,
	[Variant]: 'extension',
	store: Store.format,
}));

export const interceptors = {
	StructureExtension: checkCast<Interceptor>()({
		overlay: StructureExtension,
	}),
};

export const schemaFormat = { StructureExtension: format };
