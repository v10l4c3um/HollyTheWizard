class NPC {
	id: string; // unique identifier for the NPC
	name: string; // display name for the NPC
	dialogue: string[]; // a style guide how npc talks
	tag_description: string; // a short tag based description for broader traits

	// TODO add mood as temporary state for the NPC, which can be used to influence dialogue and behavior

	constructor(
		id: string,
		name: string = "NPC",
		dialogue: string[] = [],
		tag_description: string = "",
	) {
		this.id = id;
		this.name = name;
		this.dialogue = dialogue;
		this.tag_description = tag_description;
	}
}

export default NPC;
