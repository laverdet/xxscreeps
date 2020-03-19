export function topLevelTask(task: () => Promise<void>) {
	task().catch(err => console.error(err));
}
