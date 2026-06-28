class NPC {
	name: string;
	dialogue: string[];
	affinity: number;

	constructor(name: string = "NPC", dialogue: string[] = [], affinity: number = 0) {
		this.name = name;
		this.dialogue = dialogue;
		this.affinity = affinity;
	}
}

export default NPC;
