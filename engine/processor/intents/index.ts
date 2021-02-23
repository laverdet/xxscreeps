import constructionSite from './construction-site';
import container from './container';
import controller from './controller';
import creep from './creep';
import resource from './resource';
import road from './road';
import room from './room';
import spawn from './spawn';

export function bindAllProcessorIntents() {
	constructionSite();
	container();
	controller();
	creep();
	resource();
	road();
	room();
	spawn();
}
