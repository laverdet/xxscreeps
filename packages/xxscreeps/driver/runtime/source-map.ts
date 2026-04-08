import * as Base64 from 'js-base64';
import * as SourceMap from 'source-map-support';

declare const globalThis: any;
const sourceContent = new Map<string, string>();
const runtimeSourceMap = globalThis.runtimeSourceMap;
delete globalThis.runtimeSourceMap;
SourceMap.install({
	environment: 'node',

	overrideRetrieveSourceMap: true,
	retrieveSourceMap(fileName: string) {
		if (fileName === 'runtime.js') {
			return {
				url: fileName,
				map: runtimeSourceMap,
			};
		}
		const content = sourceContent.get(fileName);
		if (content) {
			// Match final inline source map
			const matches = [ ...content.matchAll(/\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(?<map>.+)/g) ];
			if (matches.length !== 0) {
				const sourceMapContent = matches[matches.length - 1].groups!.map;
				if (sourceMapContent) {
					return {
						url: fileName,
						map: Base64.decode(sourceMapContent),
					};
				}
			}
		}
		return null;
	},
});

export function loadSourceMap(filename: string, source: string) {
	sourceContent.set(filename, source);
}
