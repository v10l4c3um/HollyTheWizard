/**
 * Static registry of yearly story-arc modules. TypeScript constants for
 * Phase 1 (not a JSON content pack) - see
 * docs/partial-blueprint-yearly-plan.md section 8.
 */

export interface ArcModuleRevealStage {
	stage: number;
	description: string;
}

export interface ArcModuleClimaxShape {
	id: string;
	description: string;
}

export interface ArcModuleDefinition {
	id: string;
	name: string;
	themeTags: string[];
	description: string;
	revealLadder: ArcModuleRevealStage[];
	climaxShapes: ArcModuleClimaxShape[];
	/** Suggested role names for moduleRoles, e.g. "instigator", "ally". */
	suggestedRoles: string[];
}

export const ARC_MODULES: ArcModuleDefinition[] = [
	{
		id: "institutional_scandal",
		name: "Institutional Scandal",
		themeTags: ["corruption", "mystery"],
		description:
			"A coverup within the school's administration begins to unravel.",
		revealLadder: [
			{ stage: 1, description: "Rumors of irregularities surface." },
			{ stage: 2, description: "Physical evidence is discovered." },
			{
				stage: 3,
				description: "A hearing or confrontation becomes unavoidable.",
			},
		],
		climaxShapes: [
			{
				id: "public_hearing",
				description: "The scandal is exposed at a public hearing.",
			},
			{
				id: "quiet_coverup",
				description:
					"Those in power bury the scandal; the player must decide whether to expose it alone.",
			},
		],
		suggestedRoles: ["whistleblower", "authority", "accomplice"],
	},
	{
		id: "forbidden_method_debate",
		name: "Forbidden Method Debate",
		themeTags: ["rivalry", "ambition"],
		description:
			"A controversial magical technique divides students and faculty.",
		revealLadder: [
			{
				stage: 1,
				description:
					"A demonstration of the forbidden method causes a stir.",
			},
			{ stage: 2, description: "Factions form for and against its use." },
			{
				stage: 3,
				description: "Pressure mounts for a decisive policy or duel.",
			},
		],
		climaxShapes: [
			{
				id: "policy_vote",
				description:
					"The school holds a vote or tribunal on the method's future.",
			},
			{
				id: "open_duel",
				description:
					"Rival proponents settle the debate in a sanctioned duel.",
			},
		],
		suggestedRoles: ["proponent", "opponent", "mediator"],
	},
];

export function getArcModule(id: string): ArcModuleDefinition | undefined {
	return ARC_MODULES.find((m) => m.id === id);
}

export function getAllArcModuleIds(): string[] {
	return ARC_MODULES.map((m) => m.id);
}
