require('source-map-support');
require('ts-node').register({
	compiler: 'typescript-cached-transpile',
	files: true,
	transpileOnly: true,
});
require('tsconfig-paths/register');
