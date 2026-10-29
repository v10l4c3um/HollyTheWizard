import { describeFact, describeFacts, logLine } from "../core/presentation/facts";
import { TurnFact, TurnFactSchema, refused } from "../core/domain/facts/TurnFact";
import { ConversationContext, evaluateConversation } from "../core/domain/npc/Conversation";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import { resolveTopic } from "../core/domain/npc/TopicRegistry";

const ref = (id: string, name = id) => ({ id, name });

const table: Array<[string, TurnFact, string, string | undefined]> = [
	[
		"moved",
		{ kind: "moved", from: ref("great_hall", "Great Hall"), to: ref("hallway", "Main Corridor"), firstVisit: true, discovered: [] },
		"You traveled to Main Corridor.",
		"Moved from Great Hall to Main Corridor",
	],
	[
		"move-blocked",
		{ kind: "move-blocked", from: ref("a", "Hall"), to: ref("b", "Library"), exits: ["Corridor", "Yard"] },
		"You can't move to Library from Hall. From Hall you can go to: Corridor, Yard.",
		"Failed to move from Hall to Library",
	],
	[
		"conversation with topic",
		{ kind: "conversation", npc: ref("hagrid", "Rubeus Hagrid"), topic: "dragons", result: "partial" },
		"Rubeus Hagrid answered cautiously about dragons. You learned something, though not everything.",
		"Talked to hagrid about dragons [partial]",
	],
	[
		"conversation without topic",
		{ kind: "conversation", npc: ref("hagrid", "Rubeus Hagrid"), result: "success" },
		"You had a pleasant conversation with Rubeus Hagrid.",
		"Talked to hagrid [success]",
	],
	[
		"studied",
		{ kind: "studied", subject: ref("charms", "Charms"), hours: 2, gain: 20, revealed: [ref("lumos", "Lumos")] },
		"You studied Charms. Gained +20 knowledge. New spells available: Lumos!",
		"Studied charms for 2h",
	],
	[
		"attended",
		{
			kind: "attended",
			subject: ref("charms", "Charms"),
			lesson: { id: "l1", title: "Floating", topic: "Levitation basics" },
			gains: [{ subject: "charms", amount: 5 }],
			revealed: [ref("a", "Alpha"), ref("b", "Beta")],
			learned: [ref("a", "Alpha")],
		},
		'Attended Charms: "Floating". Levitation basics. Knowledge: +5 charms. Learned: Alpha! New spells available: Beta!',
		"Attended charms class - Floating",
	],
	[
		"practiced",
		{ kind: "practiced", spell: ref("lumos", "Lumos"), hours: 1, attempts: 10, successes: 6, proficiency: 41.6, tier: "novice", mastered: false },
		"You practiced Lumos 10 times. Success: 6/10. Proficiency: 42/100 (Novice).",
		"Practiced lumos for 1h",
	],
	[
		"interacted",
		{ kind: "interacted", item: ref("wand", "Old Wand"), verb: "waved" },
		"You waved Old Wand. Something happened!",
		"waved wand",
	],
	[
		"rested",
		{ kind: "rested", hours: 3, place: ref("common_room", "Common Room") },
		"You rested for 3 hour(s) at Common Room. You feel refreshed!",
		"Rested for 3 hour(s) at common_room",
	],
	[
		"year-advanced",
		{ kind: "year-advanced", from: 1, to: 2 },
		"You have advanced to Year 2. A new chapter begins.",
		"Advanced from Year 1 to Year 2",
	],
	[
		"refused: unknown place with no exits",
		refused({ reason: "unknown-place", input: "mars", from: "Hall", exits: [] }),
		'You don\'t know of a place called "mars". There is nowhere to go from Hall yet.',
		undefined,
	],
	[
		"refused: person absent",
		refused({ reason: "person-absent", npc: "Snape" }),
		"Snape is not here right now.",
		undefined,
	],
	[
		"refused: class elsewhere",
		refused({ reason: "class-elsewhere", subject: "Charms", room: "Classroom" }),
		"The Charms class is held in Classroom.",
		undefined,
	],
];

describe("turn facts are worded in one place", () => {
	it.each(table)("%s", (_name, fact, sentence, line) => {
		expect(describeFact(fact)).toBe(sentence);
		expect(logLine(fact)).toBe(line);
		expect(TurnFactSchema.parse(fact)).toEqual(fact);
	});

	it("joins several facts into one text", () => {
		expect(
			describeFacts([
				{ kind: "year-advanced", from: 1, to: 2 },
				refused({ reason: "final-year" }),
			]),
		).toBe(
			"You have advanced to Year 2. A new chapter begins. You have already completed your final year at school.",
		);
	});
});

describe("recent facts drive conversation mood", () => {
	const tagsAfter = (recentFacts: TurnFact[], topic?: string) => {
		const ctx: ConversationContext = {
			npcId: "someone",
			topic,
			topicDef: resolveTopic(topic),
			npcProfile: undefined,
			isPrivate: false,
			locationId: "somewhere",
			relationship: new RelationshipStats(),
			flags: {},
			recentHistory: [],
			recentFacts,
			turnIndex: 0,
		};
		return evaluateConversation(ctx).narrationTags ?? [];
	};

	const moved = (discovered: number): TurnFact => ({
		kind: "moved",
		from: ref("a"),
		to: ref("b"),
		firstVisit: true,
		discovered: Array.from({ length: discovered }, (_, i) => ref(`p${i}`)),
	});

	it("arriving somewhere with new exits makes the talk adventurous", () => {
		expect(tagsAfter([moved(2)])).toContain("adventurous");
	});

	it("arriving somewhere with nothing new does not", () => {
		expect(tagsAfter([moved(0)])).not.toContain("adventurous");
	});

	it("turn text no longer stands in for events", () => {
		expect(tagsAfter([])).not.toContain("adventurous");
	});
});
