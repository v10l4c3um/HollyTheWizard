import { z } from "zod";
import { Spell, SpellSchema } from "../core/domain/magic/Spell";
import { LessonDefinition, LessonSchema } from "../core/domain/quest/CurriculumContent";
import { NpcData, NpcSchema } from "../core/domain/npc/Npc";
import NPC from "../core/domain/npc/Npc";

/**
 * The content types are inferred from the schemas, so they cannot drift from
 * what a pack may contain. These are checked by the compiler (an unused
 * `@ts-expect-error` is an error), and at run time against the schemas.
 */
describe("content types come from the schemas", () => {
	it("a type is exactly what its schema produces", () => {
		const same = <A, B>(_a: A extends B ? (B extends A ? true : never) : never) => undefined;
		same<Spell, z.infer<typeof SpellSchema>>(true);
		same<LessonDefinition, z.infer<typeof LessonSchema>>(true);
		same<NpcData, z.infer<typeof NpcSchema>>(true);
	});

	it("rejects at compile time what the schema rejects at run time", () => {
		const lesson = {
			id: "l1",
			subjectType: "charms",
			year: 1,
			order: 1,
			title: "t",
			topic: "t",
			rewards: {},
		} as const;

		// @ts-expect-error not an importance level
		const bad: LessonDefinition = { ...lesson, importance: "weird" };
		expect(LessonSchema.safeParse(bad).success).toBe(false);

		// @ts-expect-error not a subject
		const worse: LessonDefinition = { ...lesson, importance: "routine", subjectType: "cooking" };
		expect(LessonSchema.safeParse(worse).success).toBe(false);
	});

	it("the NPC class implements the data type", () => {
		const npc: NpcData = new NPC("a", "A");
		expect(NpcSchema.safeParse({ ...npc }).success).toBe(true);
	});
});
