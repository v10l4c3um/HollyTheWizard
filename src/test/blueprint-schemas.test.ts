import { z } from "zod";
import Registry from "../core/Registry";
import {
	campaignBaseSchemaFor,
	yearBlueprintSchemaFor,
} from "../core/domain/campaign/BlueprintSchemas";
import { getAllArcModuleIds } from "../core/domain/campaign/ArcModuleRegistry";
import {
	buildSafeCampaignBase,
	buildSafeYearBlueprint,
} from "../core/domain/campaign/DeterministicFallback";
import { buildRegistry } from "../bootstrap/engineFactory";

let registry: Registry;
beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

const { yearPlans, wasFallback, ...baseShape } = buildSafeCampaignBase("seed");

describe("campaignBaseSchemaFor", () => {
	it("accepts roles that point at real characters", () => {
		const schema = campaignBaseSchemaFor(registry);
		expect(
			schema.safeParse({ ...baseShape, longLivedRoles: { mentor: "dumbledore" } }).success,
		).toBe(true);
	});

	it("rejects an invented character", () => {
		const schema = campaignBaseSchemaFor(registry);
		const result = schema.safeParse({ ...baseShape, longLivedRoles: { mentor: "NPC-1" } });
		expect(result.success).toBe(false);
	});

	it("puts the real ids into the JSON schema the model is constrained by", () => {
		const json = z.toJSONSchema(campaignBaseSchemaFor(registry)) as any;
		const allowed = json.properties.longLivedRoles.additionalProperties.enum;
		expect(allowed).toEqual(expect.arrayContaining(["hagrid", "dumbledore"]));
		expect(allowed).not.toContain("NPC-1");
	});
});

describe("yearBlueprintSchemaFor", () => {
	const { wasFallback: _w, ...year } = buildSafeYearBlueprint(1, buildSafeCampaignBase("seed"));
	const moduleId = getAllArcModuleIds()[0];
	const valid = {
		...year,
		arcModules: [moduleId],
		moduleRoles: { ally: "hagrid" },
		clueSeeds: [{ clueId: "c1", locationId: "library", moduleId }],
	};

	it("accepts a blueprint that only uses real ids", () => {
		expect(yearBlueprintSchemaFor(registry).safeParse(valid).success).toBe(true);
	});

	it.each([
		["a module that does not exist", { arcModules: ["made_up_module"] }],
		["a character that does not exist", { moduleRoles: { ally: "gandalf" } }],
		[
			"a place that does not exist",
			{ clueSeeds: [{ clueId: "c1", locationId: "mordor", moduleId }] },
		],
		[
			"a clue tied to a module that does not exist",
			{ clueSeeds: [{ clueId: "c1", locationId: "library", moduleId: "nope" }] },
		],
	])("rejects %s", (_label, change) => {
		expect(yearBlueprintSchemaFor(registry).safeParse({ ...valid, ...change }).success).toBe(false);
	});

	it("lists the real places, characters and modules in the JSON schema", () => {
		const json = z.toJSONSchema(yearBlueprintSchemaFor(registry)) as any;
		expect(json.properties.arcModules.items.enum).toEqual(getAllArcModuleIds());
		expect(json.properties.moduleRoles.additionalProperties.enum).toContain("hagrid");
		expect(json.properties.clueSeeds.items.properties.locationId.enum).toContain("library");
	});
});
