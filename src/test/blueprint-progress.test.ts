import GameState from "../core/domain/world/GameState";
import { createGameBus } from "../core/domain/events/GameEvents";
import { BlueprintProgressService } from "../core/domain/campaign/BlueprintProgressService";
import { buildSafeCampaignBase, buildSafeYearBlueprint } from "../core/domain/campaign/DeterministicFallback";

/**
 * A quest flag is a named note that something happened. It lives in
 * `questFlags.active` or `questFlags.completed`; a milestone waiting on the
 * flag must fire for either.
 */
describe("BlueprintProgressService quest-flag milestones", () => {
	const FLAG = "mastered:levitate";
	let state: GameState;
	let reached: string[];
	let bus: ReturnType<typeof createGameBus>;
	const service = new BlueprintProgressService();

	beforeEach(() => {
		bus = createGameBus();
		state = new GameState();
		const base = buildSafeYearBlueprint(1, buildSafeCampaignBase("seed"));
		state.yearBlueprints[1] = {
			...base,
			milestones: [
				{
					id: "m_flag",
					description: "flag milestone",
					trigger: { type: "questFlag", flag: FLAG },
				},
			],
		};
		reached = [];
		bus.on("BlueprintMilestoneReached", ({ milestoneId }) =>
			reached.push(milestoneId),
		);
	});

	it("does not fire while the flag is absent", () => {
		service.checkMilestones(state, bus);
		expect(state.yearProgress.completedMilestoneIds).toEqual([]);
	});

	it("fires for a flag in the active list", () => {
		state.questFlags.active.push(FLAG);
		service.checkMilestones(state, bus);
		expect(state.yearProgress.completedMilestoneIds).toEqual(["m_flag"]);
	});

	it("fires for a flag in the completed list", () => {
		state.questFlags.completed.push(FLAG);
		service.checkMilestones(state, bus);
		expect(state.yearProgress.completedMilestoneIds).toEqual(["m_flag"]);
	});

	it("fires only once", () => {
		state.questFlags.completed.push(FLAG);
		service.checkMilestones(state, bus);
		service.checkMilestones(state, bus);
		expect(state.yearProgress.completedMilestoneIds).toEqual(["m_flag"]);
		expect(reached).toEqual(["m_flag"]);
	});
});
