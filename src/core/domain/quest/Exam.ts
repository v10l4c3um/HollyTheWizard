import { AttributeStats } from "../player/PlayerStats";

class Exam {
	attributes: AttributeStats;
	description: string;
	name: string;

	constructor(name: string, description: string, attributes: AttributeStats) {
		this.name = name;
		this.description = description;
		this.attributes = attributes;
	}
}
