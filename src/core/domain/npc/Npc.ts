class NPC {
	id: string;
	name: string;
	dialogue: string[];
	affinity: number;

	constructor(id: string, name: string = "NPC", dialogue: string[] = [], affinity: number = 0) {
		this.id = id;
		this.name = name;
		this.dialogue = dialogue;
		this.affinity = affinity;
	}
}

export default NPC;
