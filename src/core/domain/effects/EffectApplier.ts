import GameState from "../world/GameState";
import Item from "../world/Item";
import { GameEffect } from "./GameEffects";
import { GameBus } from "../events/GameEvents";
import { SubjectType } from "../quest/Curriculum";
import { MAX_RECENT_FACTS } from "../facts/TurnFact";
import { MAX_RECENT_TURNS } from "../world/RecentTurn";
import { RelationshipStats } from "../npc/Relationship";
import { Logger, silentLogger } from "../../application/ports/Logger";

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
	logger: Logger = silentLogger,
): void {
	for (const effect of effects) {
		applyEffect(state, effect, bus, logger);
	}
}

function applyEffect(
	state: GameState,
	effect: GameEffect,
	bus: GameBus | undefined,
	logger: Logger,
): void {
	switch (effect.type) {
		case "ProgressDelta":
			applyProgressDelta(state, effect.track, effect.delta, logger);
			break;
		case "SpellLearned":
			// Only an `available` spell can be taught: learning never skips
			// the "known of" step and never downgrades a learned/mastered spell.
			if (
				state.spellbook.getSpellState(effect.spellId)?.knowledgeState ===
				"available"
			) {
				state.spellbook.updateSpellState(effect.spellId, {
					knowledgeState: "learned",
					discoveredFrom: effect.source,
					proficiency: 0,
					practicePoints: 0,
				});
			}
			break;
		case "AttributeDelta":
			state.player.attributes.applyDelta(effect.delta);
			break;
		case "ResourceDelta":
			state.player.resources.applyDelta(effect.delta);
			break;
		case "RelationshipDelta":
			// First contact creates the record, so no delta is ever dropped.
			(state.relationships[effect.npcId] ??= new RelationshipStats()).applyDelta(
				effect.delta,
			);
			break;
		case "FlagSet":
			state.flags[effect.flagId] = effect.value;
			break;
		case "InventoryDelta":
			applyInventoryDelta(state, effect.itemId, effect.delta);
			break;
		case "TopicUnlocked": {
			const topics = state.unlockedTopicsByNpc[effect.npcId] ?? [];
			if (!topics.includes(effect.topicId)) {
				topics.push(effect.topicId);
			}
			state.unlockedTopicsByNpc[effect.npcId] = topics;
			break;
		}
		case "ClueRevealed":
			state.clues[effect.clueId] = {
				discovered: true,
				sourceNpcId: effect.sourceNpcId,
			};
			break;
		case "RumorLearned":
			state.rumors[effect.rumorId] = {
				known: true,
				sourceNpcId: effect.sourceNpcId,
			};
			break;
		case "SceneInvitationCreated":
			state.sceneInvitations.push({
				invitationId: effect.invitationId,
				npcId: effect.npcId,
				sceneType: effect.sceneType,
				validUntilMinutes: effect.validUntilMinutes,
			});
			break;
		case "ConversationMemoryRecorded": {
			const history = state.conversationHistory[effect.npcId] ?? [];
			history.push(effect.entry);
			// Cap at 20 entries per NPC (drop oldest)
			if (history.length > 20) {
				history.splice(0, history.length - 20);
			}
			state.conversationHistory[effect.npcId] = history;
			break;
		}
		case "LocationChanged":
			state.currentLocationId = effect.locationId;
			for (const list of [
				state.visitedLocationIds,
				state.discoveredLocationIds,
			]) {
				if (!list.includes(effect.locationId)) list.push(effect.locationId);
			}
			break;
		case "LocationsDiscovered":
			for (const id of effect.locationIds) {
				if (!state.discoveredLocationIds.includes(id)) {
					state.discoveredLocationIds.push(id);
				}
			}
			break;
		case "TimeAdvanced":
			state.worldClock.advanceTime(effect.minutes);
			bus?.emit("TimeAdvanced", {
				minutesDelta: effect.minutes,
				newMinutesOfDay: state.worldClock.getMinutesOfDay(),
				totalMinutes: state.worldClock.getTotalMinutes(),
			});
			break;
		case "SceneInvitationExpired":
			state.sceneInvitations = state.sceneInvitations.filter(
				(invitation) => invitation.invitationId !== effect.invitationId,
			);
			break;
		case "RandomStateSet":
			state.randomState = effect.state;
			break;
		case "TurnRecorded":
			state.recentTurns.push(effect.turn);
			if (state.recentTurns.length > MAX_RECENT_TURNS) {
				state.recentTurns.splice(0, state.recentTurns.length - MAX_RECENT_TURNS);
			}
			break;
		case "FactsRecorded":
			state.recentFacts.push(...effect.facts);
			if (state.recentFacts.length > MAX_RECENT_FACTS) {
				state.recentFacts.splice(0, state.recentFacts.length - MAX_RECENT_FACTS);
			}
			break;
		case "SpellRevealed":
			// Only a hidden spell becomes available; a spell the player already
			// knows of, has learned or has mastered must never be moved back.
			if (
				state.spellbook.getSpellState(effect.spellId)?.knowledgeState ===
				"hidden"
			) {
				state.spellbook.updateSpellState(effect.spellId, {
					knowledgeState: "available",
					becameAvailableAt: effect.atMinutes,
				});
			}
			break;
		case "SpellStateUpdated":
			state.spellbook.setSpellState(effect.spellId, effect.state);
			break;
		case "LessonAdvanced": {
			const subject = state.academicState.subjects[effect.subject];
			if (subject) {
				(effect.attended
					? subject.attendedLessons
					: subject.skippedLessons
				).push(effect.lessonId);
				subject.currentLessonOrder += 1;
			}
			break;
		}
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
	logger: Logger,
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

	logger.warn(`applyEffects: no handler for ProgressDelta track "${track}"`);
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
