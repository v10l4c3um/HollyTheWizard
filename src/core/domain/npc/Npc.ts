class NPC {
	id: string;
	name: string;
	dialogue: string[];
	affinity: number;
	tag_description: string;

	constructor(
		id: string,
		name: string = "NPC",
		dialogue: string[] = [],
		affinity: number = 0,
		tag_description: string = "",
	) {
		this.id = id;
		this.name = name;
		this.dialogue = dialogue;
		this.affinity = affinity;
		this.tag_description = tag_description;
	}
}

export default NPC;
