/**
 * Static topic metadata. Does NOT import from NpcProfile to keep deps clean.
 */

export type TopicCategory =
	| "academic"
	| "personal"
	| "social"
	| "secret"
	| "lore"
	| "quest";

export type TopicSensitivity = "open" | "guarded" | "sensitive";

export interface TopicDefinition {
	id: string;
	category: TopicCategory;
	sensitivity: TopicSensitivity;
	/** Minimum relationship.trust required for this topic. */
	minTrust?: number;
	/** Minimum relationship.affection required for this topic. */
	minAffection?: number;
	/** All flag ids in this list must be truthy in state.flags. */
	requiresFlags?: string[];
	/** Location ids where this topic is more natural (+1 affinity bonus). */
	locationRelevance?: string[];
	/** Turns before raising this topic again without a score penalty. */
	cooldownTurns?: number;
}

export const TOPICS: Record<string, TopicDefinition> = {
	dark_arts: {
		id: "dark_arts",
		category: "secret",
		sensitivity: "sensitive",
		minTrust: 60,
		locationRelevance: ["restricted_section", "dungeons"],
		cooldownTurns: 5,
	},
	personal_history: {
		id: "personal_history",
		category: "personal",
		sensitivity: "sensitive",
		minTrust: 50,
		minAffection: 20,
		cooldownTurns: 3,
	},
	academic_performance: {
		id: "academic_performance",
		category: "academic",
		sensitivity: "open",
		locationRelevance: ["classroom", "library", "dungeons"],
		cooldownTurns: 2,
	},
	potions: {
		id: "potions",
		category: "academic",
		sensitivity: "open",
		locationRelevance: ["classroom", "dungeons", "greenhouse"],
		cooldownTurns: 2,
	},
	magical_creatures: {
		id: "magical_creatures",
		category: "lore",
		sensitivity: "open",
		locationRelevance: ["grounds", "forbidden_forest", "hagrid_hut"],
		cooldownTurns: 2,
	},
	school_gossip: {
		id: "school_gossip",
		category: "social",
		sensitivity: "guarded",
		minTrust: 15,
		cooldownTurns: 3,
	},
	romance: {
		id: "romance",
		category: "personal",
		sensitivity: "sensitive",
		minTrust: 40,
		minAffection: 30,
		cooldownTurns: 4,
	},
	daily_chat: {
		id: "daily_chat",
		category: "social",
		sensitivity: "open",
		cooldownTurns: 1,
	},
	quidditch: {
		id: "quidditch",
		category: "social",
		sensitivity: "open",
		locationRelevance: ["quidditch_pitch", "common_room"],
		cooldownTurns: 1,
	},
	wizarding_lore: {
		id: "wizarding_lore",
		category: "lore",
		sensitivity: "open",
		locationRelevance: ["library", "classroom"],
		cooldownTurns: 2,
	},
	voldemort: {
		id: "voldemort",
		category: "secret",
		sensitivity: "sensitive",
		minTrust: 50,
		cooldownTurns: 5,
	},
	family: {
		id: "family",
		category: "personal",
		sensitivity: "guarded",
		minTrust: 25,
		cooldownTurns: 3,
	},
};

/** Default definition used when the topic id is not in TOPICS. */
const DEFAULT_TOPIC: TopicDefinition = {
	id: "unknown",
	category: "social",
	sensitivity: "open",
};

/**
 * Resolves a topic id to its definition.
 * Falls back to a permissive default for unknown ids.
 */
export function resolveTopic(topicId: string | undefined): TopicDefinition {
	if (!topicId) return DEFAULT_TOPIC;
	return TOPICS[topicId] ?? { ...DEFAULT_TOPIC, id: topicId };
}
