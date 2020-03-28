import controller from './controller';
import creep from './creep';
import room from './room';
import source from './source';
import spawn from './spawn';

export function bindAllProcessorIntents() {
	controller();
	creep();
	room();
	source();
	spawn();
}
