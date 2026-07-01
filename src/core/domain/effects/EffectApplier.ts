import GameState from "../world/GameState";
import Item from "../world/Item";
import { GameEffect } from "./GameEffects";
import { GameBus } from "../events/GameEvents";
import { SubjectType } from "../quest/Curriculum";

/**
 * Central state-mutation path for `GameEffect`s.
 *
 * See docs/event-effect-conversion-plan.md, Steps 2-3:
 * - applies canonical state changes described by effects, in order
 * - emits "derived milestone" events when a change crosses a known threshold
 *
 * Resolvers/systems should build `GameEffect[]` and hand them to
 * `applyEffects` instead of mutating `GameState` (or emitting deltas as
 * events) directly.
 */
export function applyEffects(
	state: GameState,
	effects: GameEffect[],
	bus?: GameBus,
): void {
	for (const effect of effects) {
		applyEffect(state, effect, bus);
	}
}

function applyEffect(
	state: GameState,
	effect: GameEffect,
	bus?: GameBus,
): void {
	switch (effect.type) {
		case "ProgressDelta":
			applyProgressDelta(state, effect.track, effect.delta);
			break;
		case "AttributeDelta":
			state.academicState.attributes[effect.attributeId] =
				(state.academicState.attributes[effect.attributeId] ?? 0) +
				effect.delta;
			break;
		case "ResourceDelta": // energy/stress/reputation
			state.resources[effect.resourceId] =
				(state.resources[effect.resourceId] ?? 0) + effect.delta;
			break;
		case "RelationshipDelta": {
			const axes = (state.relationships[effect.npcId] ??= {});
			axes[effect.axis] = (axes[effect.axis] ?? 0) + effect.delta;
			break;
		}
		case "FlagSet":
			state.flags[effect.flagId] = effect.value;
			break;
		case "InventoryDelta":
			applyInventoryDelta(state, effect.itemId, effect.delta);
			break;
	}
}

const SUBJECT_KNOWLEDGE_TRACK = /^subject\.(.+)\.knowledge$/;

/**
 * Only "subject.<id>.knowledge" is wired up today. Spell proficiency
 * ("spell.<id>.proficiency") keeps flowing through SpellProgressionService
 * for now because its update rule isn't a plain delta (practice points,
 * reliability, mastery tier, diminishing returns, ...). Migrating it to a
 * pure ProgressDelta is tracked separately (plan Step 9).
 */
function applyProgressDelta(
	state: GameState,
	track: string,
	delta: number,
): void {
	const subjectMatch = track.match(SUBJECT_KNOWLEDGE_TRACK);
	if (subjectMatch) {
		const subject =
			state.academicState.subjects[subjectMatch[1] as SubjectType];
		if (subject) {
			subject.knowledge += delta;
		}
		return;
	}

	console.warn(`applyEffects: no handler for ProgressDelta track "${track}"`);
}

function applyInventoryDelta(
	state: GameState,
	itemId: string,
	delta: number,
): void {
	const existing = state.inventory.items.find((item) => item.id === itemId);

	if (existing) {
		existing.quantity += delta;
		if (existing.quantity <= 0) {
			state.inventory.items = state.inventory.items.filter(
				(item) => item.id !== itemId,
			);
		}
		return;
	}

	if (delta > 0) {
		state.inventory.items.push(new Item(itemId, itemId, "", delta));
	}
}
