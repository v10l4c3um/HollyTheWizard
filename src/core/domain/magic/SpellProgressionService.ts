import { SpellBalance, SpellState } from "./Spell";

interface SpellOutcome {
	success: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function computeMasteryTier(proficiency: number): SpellState["masteryTier"] {
	if (proficiency < 20) return "unfamiliar";
	if (proficiency < 50) return "learning";
	if (proficiency < 85) return "comfortable";
	return "mastered";
}

export function applySpellUse(
	state: SpellState,
	outcome: SpellOutcome,
	balance: SpellBalance,
): SpellState {
	// Clone to avoid accidental mutation bugs
	const next: SpellState = { ...state };

	// -----------------------------------
	// 1. Gain practice points
	// (failures still teach, just less)
	// -----------------------------------
	const basePracticeGain = outcome.success ? 1.0 : 0.35;
	const difficultyModifier = clamp(1 - balance.learningDifficulty, 0.1, 1);
	next.practicePoints += basePracticeGain * difficultyModifier;

	// -----------------------------------
	// 2. Convert practice → proficiency
	// -----------------------------------
	while (next.practicePoints >= balance.practiceRequirement) {
		next.practicePoints -= balance.practiceRequirement;
		// Small diminishing returns at higher proficiency
		const proficiencyFactor = clamp(1 - next.proficiency / 120, 0.2, 1);
		const gain = 2 * proficiencyFactor;
		next.proficiency = clamp(next.proficiency + gain, 0, 100);
	}

	// -----------------------------------
	// 3. Update reliability based on recent outcome
	// (exponential moving average)
	// -----------------------------------
	const alpha = 0.1;
	const outcomeValue = outcome.success ? 100 : 0;
	next.reliability = next.reliability * (1 - alpha) + outcomeValue * alpha;

	// -----------------------------------
	// 4. Stability tracks consistency (use proficiency as proxy)
	// -----------------------------------
	next.stability = clamp(next.proficiency / 100, 0, 1);

	// -----------------------------------
	// 5. Update mastery tier and level
	// -----------------------------------
	next.masteryTier = computeMasteryTier(next.proficiency);
	next.masteryLevel = next.proficiency;

	// -----------------------------------
	// 6. Check if spell should be considered mastered
	// -----------------------------------
	if (next.proficiency >= 85 && next.knowledgeState === "learned") {
		next.knowledgeState = "mastered";
	}

	return next;
}
