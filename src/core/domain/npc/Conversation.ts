import {
	GameEffect,
	relationshipDelta,
	topicUnlocked,
	clueRevealed,
	rumorLearned,
	sceneInvitationCreated,
	flagSet,
	conversationMemoryRecorded,
} from "../effects/GameEffects";
import { RelationshipStats } from "./Relationship";
import { NpcConversationProfile } from "./NpcProfile";
import { TopicDefinition } from "./TopicRegistry";
import { ConversationResult, ConversationMemoryEntry } from "./ConversationTypes";

// Re-export ConversationResult so existing imports keep working
export type { ConversationResult } from "./ConversationTypes";
export type { ConversationMemoryEntry } from "./ConversationTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationOutcome {
	result: ConversationResult;
	effects: GameEffect[];
	/** Numeric score accumulated across phases 3-7, used for mapping. */
	score: number;
	/** Optional hints passed to the narrator about tone or scene quality. */
	narrationTags?: string[];
}

export interface ConversationContext {
	npcId: string;
	topic?: string;
	/** Resolved topic metadata from TopicRegistry. */
	topicDef: TopicDefinition;
	/** Authored NPC conversation data from Registry, if available. */
	npcProfile?: NpcConversationProfile;
	/** True when the conversation takes place away from other characters. */
	isPrivate: boolean;
	/** Current location id. */
	locationId: string;
	/** Snapshot of the player's current relationship with this NPC. */
	relationship: RelationshipStats;
	/** Flags relevant to the scene (e.g. romance progress, prior encounters). */
	flags: Record<string, boolean | number | string>;
	/** Last N conversation entries for this NPC (from state.conversationHistory). */
	recentHistory: ConversationMemoryEntry[];
	/** Last few global event names from state.recentEvents. */
	recentEvents: string[];
	/** World-clock total minutes, used as turnIndex. */
	turnIndex: number;
}

/**
 * How much trust each conversation outcome moves, so tuning is one edit.
 * Every outcome moves it: neutral chats build a little, good ones more, and
 * deflections and refusals cost trust.
 */
export const TRUST_DELTA = {
	partial: 0.5,
	success: 2,
	reveal: 2,
	invitation: 2,
	deflection: -1,
	refusal: -2,
} as const;

// ---------------------------------------------------------------------------
// Evaluator — deterministic 8-phase pipeline
// ---------------------------------------------------------------------------

/**
 * Decides the outcome of a conversation attempt given the current context.
 *
 * Phase order:
 *   1. hardBoundaryCheck  — NPC hard-boundary topics → immediate refusal
 *   2. topicAvailabilityCheck — unmet trust/affection/flag requirements → deflection
 *   3. locationFitCheck   — topic not in locationRelevance → −1 penalty
 *   4. relationshipGate   — trust / affection → base score
 *   5. historyModifiers   — repeated topics, prior refusals, established intimacy
 *   6. eventMoodModifiers — recent global events (SpellMastered, etc.)
 *   7. profileAffinityModifiers — npcProfile.topicAffinities + locationModifiers
 *   8. outcomeMapping     — score → ConversationResult + effects
 *
 * Phases 1-2 short-circuit before scoring.
 * Phases 3-7 accumulate a numeric score in the range roughly −4..+4.
 * Phase 8 converts score to outcome.
 */
export function evaluateConversation(
	ctx: ConversationContext,
): ConversationOutcome {
	const { relationship, topic, isPrivate, flags, npcId, npcProfile, topicDef,
		locationId, recentHistory, recentEvents, turnIndex } = ctx;

	const narrationTags: string[] = [];

	// Private setting is always a positive narration signal
	if (isPrivate) narrationTags.push("private-setting");

	// ── Phase 1: Hard boundary check ─────────────────────────────────────────
	// NPC's authored hard-boundary topics → immediate refusal, no effects.
	if (topic && npcProfile?.hardBoundaries.includes(topic)) {
		narrationTags.push("boundary-hit", "tense", "guarded");
		const entry: ConversationMemoryEntry = {
			topic,
			result: "refusal",
			locationId,
			turnIndex,
			tags: ["boundary-hit"],
		};
		return {
			result: "refusal",
			score: -10,
			effects: [
				relationshipDelta(npcId, { resentment: 1, trust: TRUST_DELTA.refusal }, "raised a topic the NPC will never discuss"),
				conversationMemoryRecorded(npcId, entry),
			],
			narrationTags,
		};
	}

	// ── Phase 2: Topic availability check ────────────────────────────────────
	// Check minTrust, minAffection, requiresFlags
	const trustGap = topicDef.minTrust !== undefined
		? topicDef.minTrust - relationship.trust
		: 0;
	const affectionGap = topicDef.minAffection !== undefined
		? topicDef.minAffection - relationship.affection
		: 0;

	const missingFlags = (topicDef.requiresFlags ?? []).filter(
		(f) => !flags[f],
	);

	if (trustGap > 0 || affectionGap > 0 || missingFlags.length > 0) {
		narrationTags.push("deflecting", "guarded");
		const deflectFlagKey = `deflected.${npcId}.${topic ?? "general"}`;
		const entry: ConversationMemoryEntry = {
			topic,
			result: "deflection",
			locationId,
			turnIndex,
			tags: ["requirements-not-met"],
		};
		return {
			result: "deflection",
			score: -3,
			effects: [
				relationshipDelta(npcId, { trust: TRUST_DELTA.deflection }, "asked for more than the relationship allows"),
				flagSet(deflectFlagKey, true, "topic unavailable due to missing requirements"),
				conversationMemoryRecorded(npcId, entry),
			],
			narrationTags,
		};
	}

	// ── Phase 2b: Hostility gate (kept from original logic) ──────────────────
	const suspicionLevel = classifySuspicion(relationship.resentment, relationship.fear);
	if (suspicionLevel === "hostile") {
		narrationTags.push("tense", "guarded", "hostile");
		const entry: ConversationMemoryEntry = {
			topic,
			result: "refusal",
			locationId,
			turnIndex,
			tags: ["hostility"],
		};
		return {
			result: "refusal",
			score: -10,
			effects: [
				relationshipDelta(npcId, { resentment: 1, trust: TRUST_DELTA.refusal }, "pushed despite hostility"),
				conversationMemoryRecorded(npcId, entry),
			],
			narrationTags,
		};
	}

	// ── Phase 2c: Pushy repetition check (kept from original logic) ──────────
	const deflectFlagKey = `deflected.${npcId}.${topic ?? "general"}`;
	if (topic && flags[deflectFlagKey]) {
		narrationTags.push("irritated", "suspicious");
		const entry: ConversationMemoryEntry = {
			topic,
			result: "refusal",
			locationId,
			turnIndex,
			tags: ["pushy-repeat"],
		};
		return {
			result: "refusal",
			score: -10,
			effects: [
				relationshipDelta(
					npcId,
					{ resentment: 3, trust: TRUST_DELTA.refusal },
					"pressed a topic after being deflected",
				),
				flagSet(deflectFlagKey, false, "deflect flag consumed after penalty"),
				conversationMemoryRecorded(npcId, entry),
			],
			narrationTags,
		};
	}

	// ── Scoring begins ────────────────────────────────────────────────────────
	let score = 0;

	// ── Phase 3: Location fit check ──────────────────────────────────────────
	// If the topic has location relevance defined and we're NOT in one of those
	// locations, apply a small penalty.
	if (topicDef.locationRelevance && topicDef.locationRelevance.length > 0) {
		if (!topicDef.locationRelevance.includes(locationId)) {
			score -= 1;
			narrationTags.push("off-context");
		} else {
			score += 1; // bonus for being in the right place
			narrationTags.push("location-natural");
		}
	}

	// ── Phase 4: Relationship gate ───────────────────────────────────────────
	const trustLevel = classifyTrust(relationship.trust);
	const affinityLevel = classifyAffection(relationship.affection);

	switch (trustLevel) {
		case "high":
			score += 2;
			narrationTags.push("warm");
			break;
		case "moderate":
			score += 1;
			break;
		case "low":
			score -= 1;
			narrationTags.push("guarded");
			break;
	}

	if (affinityLevel === "high") {
		score += 1;
		narrationTags.push("affectionate");
	}

	if (suspicionLevel === "wary") {
		score -= 1;
		narrationTags.push("tense");
	}

	if (isPrivate && trustLevel !== "low") {
		score += 1; // private setting bonus
	}

	// ── Phase 5: History modifiers ───────────────────────────────────────────
	if (recentHistory.length > 0) {
		// Same topic asked in the last 3 turns → score −1 per repeat, max −2
		if (topic) {
			const last3 = recentHistory.slice(-3);
			const repeatCount = last3.filter((e) => e.topic === topic).length;
			if (repeatCount > 0) {
				const penalty = Math.min(repeatCount, 2);
				score -= penalty;
				narrationTags.push("repeat-question");
			}
		}

		// Previous result for this NPC was "refusal" and player didn't push
		// (i.e. next interaction after refusal was NOT also a refusal) → +1
		const hasRespectfulHandling = recentHistory.some((entry, i) => {
			if (entry.result === "refusal" && i < recentHistory.length - 1) {
				return recentHistory[i + 1]?.result !== "refusal";
			}
			return false;
		});
		if (hasRespectfulHandling) {
			score += 1;
			narrationTags.push("respectful");
		}

		// Any "reveal" in recent history → +1 (intimacy established)
		const hasReveal = recentHistory.some((e) => e.result === "reveal");
		if (hasReveal) {
			score += 1;
			narrationTags.push("intimate");
		}
	}

	// ── Phase 6: Event mood modifiers ────────────────────────────────────────
	// These are small ±1 nudges; never override hard gates.
	if (recentEvents.includes("SpellMastered") && npcProfile?.traits.includes("academic")) {
		score += 1;
		narrationTags.push("academic-context");
	}
	if (recentEvents.includes("LocationDiscovered")) {
		score += 1;
		narrationTags.push("adventurous");
	}
	if (recentEvents.includes("LessonAttended") && topicDef.category === "academic") {
		score += 1;
		narrationTags.push("academic-context");
	}

	// ── Phase 7: Profile affinity modifiers ──────────────────────────────────
	if (npcProfile) {
		if (topic) {
			const topicMod = npcProfile.topicAffinities[topic] ?? 0;
			score += topicMod;
			if (topicMod < -1) narrationTags.push("topic-aversion");
			if (topicMod > 1) narrationTags.push("topic-enthusiasm");
		}
		const locationMod = npcProfile.locationModifiers?.[locationId] ?? 0;
		score += locationMod;
	}

	// ── Phase 8: Outcome mapping ─────────────────────────────────────────────
	return buildOutcome(ctx, score, narrationTags, deflectFlagKey);
}

// ---------------------------------------------------------------------------
// Phase 8 implementation
// ---------------------------------------------------------------------------

/**
 * Score mapping:
 *   ≤ −2   → deflection
 *   −1..0  → partial
 *   1..2   → success
 *   3      → reveal
 *   4+     → invitation (if private + high affection)
 *
 * Refusal is produced only by phases 1-2c (hard checks/hostility).
 */
function buildOutcome(
	ctx: ConversationContext,
	score: number,
	narrationTags: string[],
	deflectFlagKey: string,
): ConversationOutcome {
	const { npcId, topic, relationship, isPrivate, locationId, turnIndex } = ctx;

	if (score <= -2) {
		// Deflection — topic not suitable in this context
		narrationTags.push("deflecting", "evasive");
		const entry: ConversationMemoryEntry = {
			topic,
			result: "deflection",
			locationId,
			turnIndex,
			tags: narrationTags.slice(),
		};
		return {
			result: "deflection",
			score,
			effects: [
				relationshipDelta(npcId, { trust: TRUST_DELTA.deflection }, "topic did not suit the moment"),
				flagSet(deflectFlagKey, true, "topic was deflected"),
				conversationMemoryRecorded(npcId, entry),
			],
			narrationTags,
		};
	}

	if (score <= 0) {
		// Partial
		narrationTags.push("cautious", "measured");
		const effects: GameEffect[] = [
			relationshipDelta(npcId, { trust: TRUST_DELTA.partial }, "neutral conversation"),
		];
		if (topic) {
			effects.push(topicUnlocked(npcId, topic, "unlocked through partial conversation"));
		}
		const entry: ConversationMemoryEntry = {
			topic,
			result: "partial",
			locationId,
			turnIndex,
			tags: narrationTags.slice(),
		};
		effects.push(conversationMemoryRecorded(npcId, entry));
		return { result: "partial", score, effects, narrationTags };
	}

	if (score <= 2) {
		// Success
		narrationTags.push("friendly", "relaxed");
		const effects: GameEffect[] = [
			relationshipDelta(npcId, { trust: TRUST_DELTA.success }, "good conversation"),
		];
		if (topic) {
			effects.push(topicUnlocked(npcId, topic, "earned through successful conversation"));
		}
		if (relationship.affection >= 15 && topic) {
			effects.push(
				rumorLearned(
					`rumor.${npcId}.${topic}`,
					"shared casually by a trusted friend",
					npcId,
				),
			);
		}
		const entry: ConversationMemoryEntry = {
			topic,
			result: "success",
			locationId,
			turnIndex,
			tags: narrationTags.slice(),
		};
		effects.push(conversationMemoryRecorded(npcId, entry));
		return { result: "success", score, effects, narrationTags };
	}

	if (score === 3) {
		// Reveal
		narrationTags.push("candid", "trusting");
		const effects: GameEffect[] = [
			relationshipDelta(npcId, { trust: TRUST_DELTA.reveal, comfort: 2 }, "candid conversation"),
		];
		if (topic) {
			effects.push(
				clueRevealed(
					`${npcId}.${topic}`,
					"revealed through deep trust",
					npcId,
				),
			);
		}
		const entry: ConversationMemoryEntry = {
			topic,
			result: "reveal",
			locationId,
			turnIndex,
			tags: narrationTags.slice(),
		};
		effects.push(conversationMemoryRecorded(npcId, entry));
		return { result: "reveal", score, effects, narrationTags };
	}

	// score >= 4 → invitation
	// Invitation only triggered in private with sufficient affection
	if (isPrivate && relationship.affection >= 30) {
		narrationTags.push("warm", "intimate", "romantic_adjacent");
		const inviteId = `invite.${npcId}.${topic ?? "general"}`;
		const effects: GameEffect[] = [
			relationshipDelta(
				npcId,
				{ trust: TRUST_DELTA.invitation, comfort: 2 },
				"intimate private conversation",
			),
			sceneInvitationCreated(
				inviteId,
				npcId,
				"private_talk",
				"high affection in private setting",
			),
		];
		if (topic) {
			effects.push(
				clueRevealed(`${npcId}.${topic}`, "revealed in private conversation", npcId),
			);
		}
		const entry: ConversationMemoryEntry = {
			topic,
			result: "invitation",
			locationId,
			turnIndex,
			tags: narrationTags.slice(),
		};
		effects.push(conversationMemoryRecorded(npcId, entry));
		return { result: "invitation", score, effects, narrationTags };
	}

	// score >= 4 but not private enough for an invitation → treat as reveal
	narrationTags.push("candid", "trusting", "open");
	const effects: GameEffect[] = [
		relationshipDelta(npcId, { trust: TRUST_DELTA.reveal, comfort: 1 }, "very good conversation"),
	];
	if (topic) {
		effects.push(topicUnlocked(npcId, topic, "deep trust unlocked topic"));
		effects.push(
			clueRevealed(`${npcId}.${topic}`, "revealed through deep trust", npcId),
		);
	}
	const entry: ConversationMemoryEntry = {
		topic,
		result: "reveal",
		locationId,
		turnIndex,
		tags: narrationTags.slice(),
	};
	effects.push(conversationMemoryRecorded(npcId, entry));
	return { result: "reveal", score, effects, narrationTags };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type TrustLevel = "low" | "moderate" | "high";
type AffectionLevel = "low" | "moderate" | "high";
type SuspicionLevel = "calm" | "wary" | "hostile";

function classifyTrust(trust: number): TrustLevel {
	if (trust >= 40) return "high";
	if (trust >= 15) return "moderate";
	return "low";
}

function classifyAffection(affection: number): AffectionLevel {
	if (affection >= 30) return "high";
	if (affection >= 10) return "moderate";
	return "low";
}

function classifySuspicion(resentment: number, fear: number): SuspicionLevel {
	const combined = resentment + fear;
	if (combined >= 40) return "hostile";
	if (combined >= 20) return "wary";
	return "calm";
}
