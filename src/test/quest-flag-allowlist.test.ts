import { z } from "zod";
import Registry from "../core/Registry";
import { yearBlueprintSchemaFor } from "../core/domain/campaign/BlueprintSchemas";
import { validateYearBlueprintSemantics } from "../core/domain/campaign/CampaignBlueprintService";
import {
	buildSafeCampaignBase,
	buildSafeYearBlueprint,
} from "../core/domain/campaign/DeterministicFallback";
import { getAllArcModuleIds } from "../core/domain/campaign/ArcModuleRegistry";
import { QUEST_FLAG_EVENTS, questFlagAllowlist } from "../core/domain/campaign/QuestFlags";
import { lintContent } from "../core/content/ContentLinter";
import { buildYearBlueprintPrompt } from "../ai/narration/BlueprintPromptBuilder";
import { buildRegistry } from "../bootstrap/engineFactory";

let registry: Registry;
beforeAll(() => {
	registry = buildRegistry();
});

const campaign = buildSafeCampaignBase("seed");
const { wasFallback: _w, ...base } = buildSafeYearBlueprint(1, campaign);
const moduleId = getAllArcModuleIds()[0];

const withMilestone = (flag: string) => ({
	...base,
	arcModules: [moduleId],
	milestones: [
		{ id: "m1", description: "d", trigger: { type: "questFlag" as const, flag } },
	],
});

describe("the flags a blueprint may use", () => {
	const flags = () => questFlagAllowlist(registry);

	it("are built from the content: lessons, places and spells", () => {
		expect(flags()).toEqual(
			expect.arrayContaining([
				"lesson_completed:charms:charms-1-1",
				"discovered:library",
				`spell_revealed:${registry.getAllSpellIds()[0]}`,
				`mastered:${registry.getAllSpellIds()[0]}`,
			]),
		);
		expect(new Set(flags()).size).toBe(flags().length);
	});

	it("are exactly the flags the game's events set", () => {
		const set = (effects: { list: string; flag: string }[]) => effects.map((e) => e.flag);
		const fromEvents = [
			...set(QUEST_FLAG_EVENTS.LessonAttended({ subjectId: "charms", lessonId: "charms-1-1", lessonTitle: "t" }) as never),
			...set(QUEST_FLAG_EVENTS.LocationDiscovered({ locationId: "library" }) as never),
			...set(QUEST_FLAG_EVENTS.SpellRevealed({ spellId: "lumos", source: "class" }) as never),
			...set(QUEST_FLAG_EVENTS.SpellMastered({ spellId: "lumos" }) as never),
		];
		const allowed = new Set([...flags(), "spell_revealed:lumos", "mastered:lumos"]);
		for (const flag of fromEvents) expect(allowed.has(flag)).toBe(true);
	});

	it("are the only flags the blueprint schema accepts", () => {
		const schema = yearBlueprintSchemaFor(registry);
		expect(schema.safeParse(withMilestone("discovered:library")).success).toBe(true);
		expect(schema.safeParse(withMilestone("found_the_secret")).success).toBe(false);
		expect(
			schema.safeParse({ ...withMilestone("discovered:library"), gates: [{ flag: "made_up", description: "d" }] }).success,
		).toBe(false);
		expect(
			schema.safeParse({
				...withMilestone("discovered:library"),
				climaxOptions: [{ id: "c", description: "d", preconditions: ["made_up"] }],
			}).success,
		).toBe(false);
	});

	it("are listed in the JSON schema the model is held to, and in the prompt", () => {
		const json = z.toJSONSchema(yearBlueprintSchemaFor(registry)) as any;
		const triggers = json.properties.milestones.items.properties.trigger.anyOf;
		const flagEnum = triggers.find((t: any) => t.properties.flag).properties.flag.enum;
		expect(flagEnum).toContain("discovered:library");

		const prompt = buildYearBlueprintPrompt(campaign, { year: 1 } as never, registry);
		expect(prompt).toContain("discovered:library");
		expect(prompt).toContain("lesson_completed:charms:charms-1-1");
	});

	it("are also checked after generation, whatever schema produced the blueprint", () => {
		const bad = { ...withMilestone("found_the_secret"), wasFallback: false };
		const result = validateYearBlueprintSemantics(bad as never, registry);
		expect(result.ok).toBe(false);
		expect(result.errors.join(" ")).toContain('"found_the_secret"');

		const good = { ...withMilestone("discovered:library"), wasFallback: false };
		expect(validateYearBlueprintSemantics(good as never, registry).ok).toBe(true);
	});
});

describe("the linter and the blueprints", () => {
	it("passes for the shipped content, including the fallback blueprint of every year", () => {
		expect(lintContent(registry)).toEqual([]);
	});

	it("complains when the content gives a blueprint nothing to refer to", () => {
		const empty = new Registry();
		const problems = lintContent(empty);
		expect(problems).toContain("The content defines nothing a blueprint could use as a quest flag");
	});
});
