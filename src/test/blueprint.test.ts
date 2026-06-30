import Registry from "../core/Registry";
import GameState from "../core/domain/world/GameState";
import Location from "../core/domain/world/Location";
import NPC from "../core/domain/npc/Npc";
import { createGameBus } from "../core/domain/events/GameEvents";

import {
	CampaignBlueprintBaseSchema,
	YearBlueprintSchema,
} from "../core/domain/campaign/BlueprintSchemas";
import {
	validateYearBlueprintSemantics,
	validateCampaignBaseSemantics,
} from "../core/domain/campaign/CampaignBlueprintService";
import {
	buildSafeCampaignBase,
	buildSafeYearBlueprint,
} from "../core/domain/campaign/DeterministicFallback";
import { YearBlueprint } from "../core/domain/campaign/YearBlueprint";
import { BlueprintLLMProvider } from "../ai/providers/BlueprintLLMProvider";
import { GenerateYearBlueprint } from "../core/application/use-cases/GenerateYearBlueprint";
import { AdvanceYear } from "../core/application/use-cases/AdvanceYear";
import { JsonPersistenceRepository } from "../infastructure/persistance/json/JsonPersistenceRepository";

function buildRegistry(): Registry {
	const registry = new Registry();
	registry.registerLocation(
		new Location("startingVillage", "Starting Village", "desc", ["forest"]),
	);
	registry.registerLocation(
		new Location("forest", "Forest", "desc", ["startingVillage"]),
	);
	registry.registerNPC(new NPC("mentor_npc", "Mentor", ["hello"], 0));
	return registry;
}

describe("Blueprint schemas", () => {
	it("accepts a valid campaign base payload", () => {
		const result = CampaignBlueprintBaseSchema.safeParse({
			blueprintVersion: "1.0.0",
			seed: "abc",
			runThemes: ["mystery"],
			toneProfile: "tense",
			runTruths: {
				hasHiddenMentor: true,
				worldIsInDecline: false,
				playerIsSuspectedOfSomething: false,
				ancientThreatIsStirring: false,
			},
			longLivedRoles: { mentor: "mentor_npc" },
		});
		expect(result.success).toBe(true);
	});

	it("rejects a campaign base payload with an invalid theme", () => {
		const result = CampaignBlueprintBaseSchema.safeParse({
			blueprintVersion: "1.0.0",
			seed: "abc",
			runThemes: ["not_a_real_theme"],
			toneProfile: "tense",
			runTruths: {
				hasHiddenMentor: true,
				worldIsInDecline: false,
				playerIsSuspectedOfSomething: false,
				ancientThreatIsStirring: false,
			},
			longLivedRoles: {},
		});
		expect(result.success).toBe(false);
	});

	it("accepts a valid year blueprint payload", () => {
		const result = YearBlueprintSchema.safeParse({
			year: 1,
			arcModules: ["institutional_scandal"],
			moduleRoles: { whistleblower: "mentor_npc" },
			clueSeeds: [],
			gates: [],
			milestones: [
				{
					id: "m1",
					description: "Start",
					trigger: { type: "yearStart" },
				},
			],
			climaxOptions: [
				{
					id: "public_hearing",
					description: "desc",
					preconditions: [],
				},
			],
			compatibilityNotes: [],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a year blueprint payload missing required fields", () => {
		const result = YearBlueprintSchema.safeParse({ year: 1 });
		expect(result.success).toBe(false);
	});
});

describe("Blueprint semantic validation", () => {
	it("flags unknown NPC ids in longLivedRoles", () => {
		const registry = buildRegistry();
		const result = validateCampaignBaseSemantics(
			{
				blueprintVersion: "1.0.0",
				seed: "abc",
				runThemes: ["mystery"],
				toneProfile: "tense",
				runTruths: {
					hasHiddenMentor: false,
					worldIsInDecline: false,
					playerIsSuspectedOfSomething: false,
					ancientThreatIsStirring: false,
				},
				longLivedRoles: { mentor: "ghost_npc" },
			},
			registry,
		);
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("flags unknown location and module ids in a year blueprint", () => {
		const registry = buildRegistry();
		const blueprint: YearBlueprint = {
			year: 1,
			arcModules: ["not_a_real_module"],
			moduleRoles: {},
			clueSeeds: [
				{
					clueId: "c1",
					locationId: "nowhere",
					moduleId: "not_a_real_module",
				},
			],
			gates: [],
			milestones: [
				{
					id: "m1",
					description: "Start",
					trigger: { type: "yearStart" },
				},
			],
			climaxOptions: [
				{ id: "x", description: "desc", preconditions: [] },
			],
			compatibilityNotes: [],
			wasFallback: false,
		};
		const result = validateYearBlueprintSemantics(blueprint, registry);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes("not_a_real_module"))).toBe(
			true,
		);
		expect(result.errors.some((e) => e.includes("nowhere"))).toBe(true);
	});

	it("passes for a well-formed year blueprint referencing known ids", () => {
		const registry = buildRegistry();
		const blueprint: YearBlueprint = {
			year: 1,
			arcModules: ["institutional_scandal"],
			moduleRoles: { whistleblower: "mentor_npc" },
			clueSeeds: [
				{
					clueId: "c1",
					locationId: "forest",
					moduleId: "institutional_scandal",
				},
			],
			gates: [],
			milestones: [
				{
					id: "m1",
					description: "Start",
					trigger: { type: "yearStart" },
				},
			],
			climaxOptions: [
				{
					id: "public_hearing",
					description: "desc",
					preconditions: [],
				},
			],
			compatibilityNotes: [],
			wasFallback: false,
		};
		const result = validateYearBlueprintSemantics(blueprint, registry);
		expect(result.ok).toBe(true);
	});
});

describe("Deterministic fallback builders", () => {
	it("buildSafeCampaignBase produces schema-valid output", () => {
		const base = buildSafeCampaignBase("seed-123");
		const { yearPlans, wasFallback, ...generatedShape } = base;
		const result = CampaignBlueprintBaseSchema.safeParse(generatedShape);
		expect(result.success).toBe(true);
		expect(base.wasFallback).toBe(true);
	});

	it("buildSafeYearBlueprint produces schema-valid output", () => {
		const campaignBase = buildSafeCampaignBase("seed-123");
		const yearBlueprint = buildSafeYearBlueprint(1, campaignBase);
		const { wasFallback, ...generatedShape } = yearBlueprint;
		const result = YearBlueprintSchema.safeParse(generatedShape);
		expect(result.success).toBe(true);
		expect(yearBlueprint.wasFallback).toBe(true);
	});
});

describe("AdvanceYear use-case", () => {
	it("advances the year and generates a new blueprint via a stubbed LLM provider", async () => {
		const registry = buildRegistry();
		const bus = createGameBus();
		const state = new GameState();
		state.campaignBlueprint = buildSafeCampaignBase("seed-123");
		state.yearBlueprints[1] = buildSafeYearBlueprint(
			1,
			state.campaignBlueprint,
		);

		const stubProvider = {
			generateJson: jest.fn().mockResolvedValue({
				year: 2,
				arcModules: ["forbidden_method_debate"],
				moduleRoles: {},
				clueSeeds: [],
				gates: [],
				milestones: [
					{
						id: "m2",
						description: "Year 2 begins",
						trigger: { type: "yearStart" },
					},
				],
				climaxOptions: [
					{
						id: "policy_vote",
						description: "desc",
						preconditions: [],
					},
				],
				compatibilityNotes: [],
			}),
		} as unknown as BlueprintLLMProvider;

		const generateYearBlueprint = new GenerateYearBlueprint(
			stubProvider,
			registry,
			bus,
		);
		const advanceYear = new AdvanceYear(generateYearBlueprint, bus);

		const result = await advanceYear.execute(state);

		expect(state.currentYear).toBe(2);
		expect(state.yearBlueprints[2]?.arcModules).toEqual([
			"forbidden_method_debate",
		]);
		expect(state.yearBlueprints[2]?.wasFallback).toBe(false);
		expect(state.yearProgress.year).toBe(2);
		expect(state.campaignBlueprint?.yearPlans[1]).toBeDefined();
		expect(result.briefOutput).toContain("Year 2");
	});

	it("falls back to a deterministic blueprint when the LLM provider fails validation", async () => {
		const registry = buildRegistry();
		const bus = createGameBus();
		const state = new GameState();
		state.campaignBlueprint = buildSafeCampaignBase("seed-123");
		state.yearBlueprints[1] = buildSafeYearBlueprint(
			1,
			state.campaignBlueprint,
		);

		const stubProvider = {
			generateJson: jest.fn().mockResolvedValue(null),
		} as unknown as BlueprintLLMProvider;

		const generateYearBlueprint = new GenerateYearBlueprint(
			stubProvider,
			registry,
			bus,
		);
		const advanceYear = new AdvanceYear(generateYearBlueprint, bus);

		await advanceYear.execute(state);

		expect(state.currentYear).toBe(2);
		expect(state.yearBlueprints[2]?.wasFallback).toBe(true);
	});
});

describe("JsonPersistenceRepository round-trip", () => {
	const testFilename = `test-save-${Date.now()}`;

	it("saves and loads a GameState with equivalent data", async () => {
		const repository = new JsonPersistenceRepository();
		const state = new GameState();
		state.currentLocationId = "forest";
		state.worldClock.advanceTime(125);
		state.spellbook.setSpellState("test_spell", {
			spellId: "test_spell",
			knowledgeState: "learned",
			proficiency: 0.5,
			practiceAttempts: 2,
			successfulCasts: 1,
		} as any);

		await repository.save(testFilename, state);
		const loaded = await repository.load(testFilename);

		expect(loaded.currentLocationId).toBe("forest");
		expect(loaded.worldClock.getMinutesOfDay()).toBe(
			state.worldClock.getMinutesOfDay(),
		);
		expect(
			loaded.spellbook.getSpellState("test_spell")?.knowledgeState,
		).toBe("learned");
	});
});
