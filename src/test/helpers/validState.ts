import GameState from "../../core/domain/world/GameState";
import Registry from "../../core/Registry";
import { createHiddenSpellState } from "../../core/domain/magic/SpellStateFactory";
import {
	buildSafeCampaignBase,
	buildSafeYearBlueprint,
} from "../../core/domain/campaign/DeterministicFallback";

/**
 * A fresh game that passes `validateLoadedState` for `registry`: every
 * registered spell present, and the stories a started game always has.
 */
export function validState(registry: Registry): GameState {
	const state = new GameState();
	for (const spellId of registry.getAllSpellIds()) {
		state.spellbook.setSpellState(spellId, createHiddenSpellState(spellId));
	}
	state.campaignBlueprint = buildSafeCampaignBase("test-seed");
	state.yearBlueprints[1] = buildSafeYearBlueprint(1, state.campaignBlueprint);
	return state;
}
