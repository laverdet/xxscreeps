import controller from './controller';
import creep from './creep';
import source from './source';
import spawn from './spawn';

export function bindAllProcessorIntents() {
	controller();
	creep();
	source();
	spawn();
}
