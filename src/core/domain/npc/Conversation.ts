import {
	GameEffect,
	relationshipDelta,
	topicUnlocked,
	clueRevealed,
	rumorLearned,
	sceneInvitationCreated,
	flagSet,
} from "../effects/GameEffects";
import { RelationshipStats } from "./Relationship";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationResult =
	| "success"
	| "partial"
	| "refusal"
	| "deflection"
	| "reveal"
	| "invitation";

export interface ConversationOutcome {
	result: ConversationResult;
	effects: GameEffect[];
	/** Optional hints passed to the narrator about tone or scene quality. */
	narrationTags?: string[];
}

export interface ConversationContext {
	npcId: string;
	topic?: string;
	/** True when the conversation takes place away from other characters. */
	isPrivate: boolean;
	/** Snapshot of the player's current relationship with this NPC. */
	relationship: RelationshipStats;
	/** Flags relevant to the scene (e.g. romance progress, prior encounters). */
	flags: Record<string, boolean | number | string>;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Decides the outcome of a conversation attempt given the current context.
 *
 * Five dimensions evaluated in priority order:
 *   1. Blocking hostility (resentment / fear) → refusal
 *   2. Pushy repetition on a blocked topic → suspicion spike + refusal
 *   3. Low trust + sensitive topic → deflection
 *   4. High trust → reveal / invitation (varies by privacy and affection)
 *   5. Moderate trust or open topic → partial / success with topic unlock
 *
 * The caller supplies a `ConversationContext` reflecting current `GameState`.
 * `applyEffects` handles the actual state mutations; this function only
 * decides *what* should happen.
 */
export function evaluateConversation(
	ctx: ConversationContext,
): ConversationOutcome {
	const { relationship, topic, isPrivate, flags, npcId } = ctx;

	const topicSensitivity = classifyTopicSensitivity(topic);
	const trustLevel = classifyTrust(relationship.trust);
	const suspicionLevel = classifySuspicion(relationship.resentment, relationship.fear);

	// ── Rule 1: Blocking hostility ──────────────────────────────────────────
	// High resentment or fear → hard refusal regardless of topic or trust.
	if (suspicionLevel === "hostile") {
		return {
			result: "refusal",
			effects: [
				relationshipDelta(npcId, { resentment: 1 }, "pushed despite hostility"),
			],
			narrationTags: ["tense", "guarded", "hostile"],
		};
	}

	// ── Rule 2: Pushy repetition ─────────────────────────────────────────────
	// If the player has already been deflected on this topic, trying again
	// raises suspicion and yields a harder refusal.
	const deflectFlagKey = `deflected.${npcId}.${topic ?? "general"}`;
	if (topic && flags[deflectFlagKey]) {
		return {
			result: "refusal",
			effects: [
				relationshipDelta(
					npcId,
					{ resentment: 3, trust: -2 },
					"pressed a topic after being deflected",
				),
				flagSet(deflectFlagKey, false, "deflect flag consumed after penalty"),
			],
			narrationTags: ["irritated", "suspicious"],
		};
	}

	// ── Rule 3: Low trust + sensitive topic → deflection ────────────────────
	if (trustLevel === "low" && topicSensitivity === "sensitive") {
		return {
			result: "deflection",
			effects: [
				relationshipDelta(npcId, { trust: -1 }, "sensitive question with low trust"),
				flagSet(deflectFlagKey, true, "topic was deflected"),
			],
			narrationTags: ["evasive", "guarded"],
		};
	}

	// ── Rule 4: Low trust + guarded topic → deflection (softer) ─────────────
	if (trustLevel === "low" && topicSensitivity === "guarded") {
		return {
			result: "deflection",
			effects: [
				flagSet(deflectFlagKey, true, "guarded topic deflected at low trust"),
			],
			narrationTags: ["evasive"],
		};
	}

	// ── Rule 5: High trust + private → reveal or invitation ─────────────────
	if (trustLevel === "high" && isPrivate) {
		const effects: GameEffect[] = [
			relationshipDelta(
				npcId,
				{ trust: 1, comfort: 2 },
				"intimate private conversation",
			),
		];

		if (topic) {
			effects.push(
				clueRevealed(
					`${npcId}.${topic}`,
					"revealed in private conversation",
					npcId,
				),
			);
		}

		// High affection + private → invitation to a future scene
		if (relationship.affection >= 30) {
			const inviteId = `invite.${npcId}.${topic ?? "general"}`;
			effects.push(
				sceneInvitationCreated(
					inviteId,
					npcId,
					"private_talk",
					"high affection in private setting",
				),
			);
			return {
				result: "invitation",
				effects,
				narrationTags: ["warm", "intimate", "romantic_adjacent"],
			};
		}

		return {
			result: "reveal",
			effects,
			narrationTags: ["candid", "trusting"],
		};
	}

	// ── Rule 6: High trust + public → partial reveal, topic unlock ───────────
	if (trustLevel === "high") {
		const effects: GameEffect[] = [
			relationshipDelta(npcId, { trust: 1 }, "good public conversation"),
		];

		if (topic && topicSensitivity !== "sensitive") {
			effects.push(topicUnlocked(npcId, topic, "high trust earned this unlock"));
		}

		// Moderate affection in public → rumor or casual invite
		if (relationship.affection >= 15 && topic) {
			effects.push(
				rumorLearned(
					`rumor.${npcId}.${topic}`,
					"shared casually by a trusted friend",
					npcId,
				),
			);
		}

		return {
			result: "partial",
			effects,
			narrationTags: ["warm", "open"],
		};
	}

	// ── Rule 7: Moderate trust + non-sensitive topic → success ───────────────
	if (trustLevel === "moderate" && topicSensitivity === "open") {
		const effects: GameEffect[] = [
			relationshipDelta(npcId, { trust: 1 }, "friendly open conversation"),
		];

		if (topic) {
			effects.push(topicUnlocked(npcId, topic, "earned through moderate trust"));
		}

		return {
			result: "success",
			effects,
			narrationTags: ["friendly", "relaxed"],
		};
	}

	// ── Rule 8: Moderate trust + guarded/sensitive topic → partial ───────────
	if (trustLevel === "moderate") {
		return {
			result: "partial",
			effects: [],
			narrationTags: ["cautious", "measured"],
		};
	}

	// ── Rule 9: Low trust + open topic → bare success (first contact) ────────
	return {
		result: "success",
		effects: [
			relationshipDelta(npcId, { trust: 1 }, "pleasant first exchange"),
		],
		narrationTags: ["neutral", "polite"],
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type TrustLevel = "low" | "moderate" | "high";
type TopicSensitivity = "open" | "guarded" | "sensitive";
type SuspicionLevel = "calm" | "wary" | "hostile";

function classifyTrust(trust: number): TrustLevel {
	if (trust >= 40) return "high";
	if (trust >= 15) return "moderate";
	return "low";
}

function classifySuspicion(resentment: number, fear: number): SuspicionLevel {
	const combined = resentment + fear;
	if (combined >= 40) return "hostile";
	if (combined >= 20) return "wary";
	return "calm";
}

function classifyTopicSensitivity(topic?: string): TopicSensitivity {
	if (!topic) return "open";
	const lower = topic.toLowerCase();
	if (SENSITIVE_TOPICS.some((t) => lower.includes(t))) return "sensitive";
	if (GUARDED_TOPICS.some((t) => lower.includes(t))) return "guarded";
	return "open";
}

const SENSITIVE_TOPICS = [
	"secret",
	"dark",
	"blood",
	"family",
	"past",
	"fear",
	"death",
	"curse",
	"forbidden",
	"murder",
	"crime",
];

const GUARDED_TOPICS = [
	"romance",
	"personal",
	"private",
	"feeling",
	"magic",
	"power",
	"ambition",
	"money",
	"politics",
];
