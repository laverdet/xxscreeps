import { importMods } from 'xxscreeps/config/mods';
import { flush } from './context';
import './import';
await importMods('test');
try {
	await flush();
} catch (err) {
	console.log(err);
}
