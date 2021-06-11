import minimist from 'minimist';
export default minimist(process.argv.slice(2), { boolean: true, stopEarly: true });
