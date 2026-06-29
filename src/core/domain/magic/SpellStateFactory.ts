import { SpellState } from "./Spell";

export function createHiddenSpellState(spellId: string): SpellState {
	return {
		spellId,
		proficiency: 0,
		practicePoints: 0,
		stability: 0,
		knowledgeState: "hidden",
		masteryTier: "unfamiliar",
		masteryLevel: 0,
		reliability: 0
	};
}

export function createLearnedSpellState(
	spellId: string,
	source: string,
	currentTime?: number
): SpellState {
	return {
		...createHiddenSpellState(spellId),
		knowledgeState: "learned",
		discoveredFrom: source,
		becameAvailableAt: currentTime
	};
}
