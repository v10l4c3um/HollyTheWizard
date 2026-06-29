import { AttributesSet } from "../player/Attributes";

class Exam {
	attributes: AttributesSet;
	description: string;
	name: string;

	constructor(name: string, description: string, attributes: AttributesSet) {
		this.name = name;
		this.description = description;
		this.attributes = attributes;
	}
}
