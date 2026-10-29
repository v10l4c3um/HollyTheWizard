import { Random } from "../random/Random";
import SpellBook from "./SpellBook";
import Registry from "../../Registry";
import { PlayerAcademicState, Requirement, SpellRevealOpportunity, SchoolData } from "../quest/Curriculum";

export class SpellRevealService {
	/** Hidden spells whose reveal condition is now met. Does not change state. */
	findRevealableSpells(
		registry: Registry,
		spellbook: SpellBook,
		academicState: PlayerAcademicState
	): string[] {
		const revealable: string[] = [];

		for (const spellState of spellbook.getAllSpells()) {
			if (spellState.knowledgeState !== "hidden") continue;
			const spell = registry.getSpell(spellState.spellId);
			if (
				spell?.definition.revealCondition &&
				this.checkRevealCondition(
					spell.definition.revealCondition,
					academicState
				)
			) {
				revealable.push(spellState.spellId);
			}
		}

		return revealable;
	}

	private checkRevealCondition(
		condition: { type: string; value: string | number; source?: string },
		academicState: PlayerAcademicState
	): boolean {
		return false;
	}

	checkRequirements(
		requirements: Requirement[],
		academicState: PlayerAcademicState,
		spellbook: SpellBook
	): boolean {
		for (const req of requirements) {
			switch (req.type) {
				case "attribute":
					if (academicState.attributes[req.id] < req.min) {
						return false;
					}
					break;
				case "subjectKnowledge":
					const subject = academicState.subjects[req.subjectId];
					if (!subject || subject.knowledge < req.min) {
						return false;
					}
					break;
				case "year":
					const currentYear = Object.values(academicState.subjects)[0]?.year || 1;
					if (currentYear < req.min) {
						return false;
					}
					break;
				case "spellKnown":
					if (!spellbook.hasLearnedSpell(req.spellId)) {
						return false;
					}
					break;
			}
		}
		return true;
	}

	/**
	 * Rolls whether a lesson reveals a spell. Does not change state: the caller
	 * applies a `SpellRevealed` effect on success.
	 */
	attemptSpellReveal(
		opportunity: SpellRevealOpportunity,
		academicState: PlayerAcademicState,
		spellbook: SpellBook,
		random: Random
	): { success: boolean; reason?: string } {
		const meetsRequirements = this.checkRequirements(
			opportunity.requirements,
			academicState,
			spellbook
		);

		if (!meetsRequirements) {
			return { success: false, reason: "Requirements not met" };
		}

		return random.next() <= opportunity.chance
			? { success: true }
			: { success: false, reason: "Failed chance roll" };
	}
}
