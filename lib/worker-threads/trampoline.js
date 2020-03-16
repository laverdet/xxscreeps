require('source-map-support');
// I guess we don't need these? What magic is this?
/*require('ts-node').register({ files: true });
require('tsconfig-paths/register');*/
process.argv.splice(1, 1);
require(process.argv[1].replace(/\.js$/, '.ts'));
