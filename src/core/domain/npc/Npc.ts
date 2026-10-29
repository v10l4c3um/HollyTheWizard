import type { DayOfWeek, SubjectType, TimeOfDay } from "../quest/Curriculum";

/** Where an NPC is at certain times. A missing day or period means "any". */
export interface ScheduleSlot {
	days?: DayOfWeek[];
	periods?: TimeOfDay[];
	location: string;
}

/**
 * Where an NPC is, in order of priority: at a timetabled class they attend or
 * teach; in the first matching slot; at home.
 */
export interface NpcSchedule {
	home: string;
	/** Follows the class timetable like a student. */
	attendsClasses?: boolean;
	/** Is in the room whenever one of these subjects is taught. */
	teaches?: SubjectType[];
	slots?: ScheduleSlot[];
}

class NPC {
	id: string; // unique identifier for the NPC
	name: string; // display name for the NPC
	dialogue: string[]; // a style guide how npc talks
	tag_description: string; // a short tag based description for broader traits
	/**
	 * In-world epithets the player might use instead of the name ("the boy who
	 * lived"). Matched as whole phrases only, so keep them few and distinctive.
	 * NPCs load from JSON as plain objects, so readers use `aliases ?? []`.
	 */
	aliases: string[];
	/** Without one, the NPC is nowhere and cannot be met. */
	schedule?: NpcSchedule;

	// TODO add mood as temporary state for the NPC, which can be used to influence dialogue and behavior

	constructor(
		id: string,
		name: string = "NPC",
		dialogue: string[] = [],
		tag_description: string = "",
		aliases: string[] = [],
	) {
		this.id = id;
		this.name = name;
		this.dialogue = dialogue;
		this.tag_description = tag_description;
		this.aliases = aliases;
	}
}

export default NPC;
