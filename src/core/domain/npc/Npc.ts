import { z } from "zod";
import { DAYS_OF_WEEK, SUBJECT_TYPES, TIMES_OF_DAY } from "../quest/Curriculum";

/**
 * The shape of an NPC in a content pack. The schemas are the single source;
 * the `NPC` class below implements the inferred data type.
 */

/** Where an NPC is at certain times. A missing day or period means "any". */
export const ScheduleSlotSchema = z.strictObject({
	days: z.array(z.enum(DAYS_OF_WEEK)).optional(),
	periods: z.array(z.enum(TIMES_OF_DAY)).optional(),
	location: z.string().min(1),
});

/**
 * Where an NPC is, in order of priority: at a timetabled class they attend or
 * teach; in the first matching slot; at home.
 */
export const NpcScheduleSchema = z.strictObject({
	home: z.string().min(1),
	/** Follows the class timetable like a student. */
	attendsClasses: z.boolean().optional(),
	/** Is in the room whenever one of these subjects is taught. */
	teaches: z.array(z.enum(SUBJECT_TYPES)).optional(),
	slots: z.array(ScheduleSlotSchema).optional(),
});

export const NpcSchema = z.strictObject({
	id: z.string().min(1),
	name: z.string().min(1),
	/** A style guide for how the NPC talks. */
	dialogue: z.array(z.string()),
	/** A short tag-based description of broader traits. */
	tag_description: z.string().default(""),
	/**
	 * In-world epithets the player might use instead of the name ("the boy who
	 * lived"). Matched as whole phrases only, so keep them few and distinctive.
	 */
	aliases: z.array(z.string()).default([]),
	/** Without one, the NPC is nowhere and cannot be met. */
	schedule: NpcScheduleSchema.optional(),
});

export type ScheduleSlot = z.infer<typeof ScheduleSlotSchema>;
export type NpcSchedule = z.infer<typeof NpcScheduleSchema>;
export type NpcData = z.infer<typeof NpcSchema>;

class NPC implements NpcData {
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
