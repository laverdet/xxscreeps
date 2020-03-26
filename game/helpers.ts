import * as C from '~/game/constants';

export function calcCreepCost(body: (C.BodyPart | { type: C.BodyPart })[]) {
	return body.reduce((cost, part) => cost +
		(typeof part === 'object' ? C.BODYPART_COST[part.type] : C.BODYPART_COST[part]), 0);
}

const names = [
	'Aaliyah', 'Aaron', 'Abigail', 'Adalyn', 'Adam', 'Addison', 'Adeline', 'Adrian', 'Aiden',
	'Alaina', 'Alex', 'Alexander', 'Alexandra', 'Alexis', 'Alice', 'Allison', 'Alyssa', 'Amelia',
	'Andrew', 'Anna', 'Annabelle', 'Anthony', 'Aria', 'Arianna', 'Asher', 'Aubrey', 'Audrey',
	'Austin', 'Ava', 'Avery', 'Bailey', 'Bella', 'Benjamin', 'Bentley', 'Blake', 'Brayden', 'Brody',
	'Brooklyn', 'Caden', 'Caleb', 'Callie', 'Camden', 'Cameron', 'Camilla', 'Caroline', 'Carson',
	'Carter', 'Charlie', 'Charlotte', 'Chase', 'Chloe', 'Christian', 'Christopher', 'Claire', 'Cole',
	'Colin', 'Colton', 'Connor', 'Cooper', 'Daniel', 'David', 'Declan', 'Dominic', 'Dylan', 'Elena',
	'Eli', 'Eliana', 'Elijah', 'Elizabeth', 'Ella', 'Ellie', 'Elliot', 'Emily', 'Emma', 'Ethan',
	'Eva', 'Evan', 'Evelyn', 'Gabriel', 'Gabriella', 'Gavin', 'Gianna', 'Grace', 'Grayson', 'Hailey',
	'Hannah', 'Harper', 'Henry', 'Hudson', 'Hunter', 'Ian', 'Isaac', 'Isabella', 'Isabelle', 'Isaiah',
	'Jack', 'Jackson', 'Jacob', 'Jake', 'James', 'Jasmine', 'Jason', 'Jayce', 'Jayden', 'Jeremiah',
	'John', 'Jonathan', 'Jordan', 'Jordyn', 'Joseph', 'Joshua', 'Josiah', 'Julia', 'Julian',
	'Juliana', 'Kaelyn', 'Kaitlyn', 'Katherine', 'Kayla', 'Kaylee', 'Keira', 'Kennedy', 'Kylie',
	'Landon', 'Lauren', 'Layla', 'Leah', 'Leo', 'Levi', 'Liam', 'Lila', 'Liliana', 'Lillian', 'Lily',
	'Lincoln', 'Logan', 'London', 'Lucas', 'Lucy', 'Luke', 'Mackenzie', 'Madelyn', 'Madison',
	'Makayla', 'Maria', 'Mason', 'Mateo', 'Matthew', 'Max', 'Maya', 'Mia', 'Micah', 'Michael', 'Mila',
	'Miles', 'Molly', 'Muhammad', 'Natalie', 'Nathan', 'Nathaniel', 'Nicholas', 'Noah', 'Nolan',
	'Nora', 'Oliver', 'Olivia', 'Owen', 'Parker', 'Penelope', 'Peyton', 'Reagan', 'Riley', 'Ruby',
	'Ryan', 'Sadie', 'Samantha', 'Samuel', 'Sarah', 'Savannah', 'Scarlett', 'Sebastian', 'Skyler',
	'Sophia', 'Sophie', 'Stella', 'Sydney', 'Taylor', 'Thomas', 'Tristan', 'Tyler', 'Victoria',
	'Violet', 'Vivian', 'William', 'Wyatt', 'Xavier', 'Zachary', 'Zoe',
];

export function getUniqueName(exists: (name: string) => boolean) {
	let ii = 0;
	do {
		let name = names[Math.floor(Math.random() * names.length)];
		if (++ii > 4) {
			name += names[Math.floor(Math.random() * names.length)];
		}
		if (!exists(name)) {
			return name;
		}
	} while (true);
}
