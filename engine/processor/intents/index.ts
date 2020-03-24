import creep from './creep';
import source from './source';
import spawn from './spawn';

export function bindAllProcessorIntents() {
	creep();
	source();
	spawn();
}
