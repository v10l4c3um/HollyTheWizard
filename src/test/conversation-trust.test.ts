import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { GameEffect, relationshipDelta } from "../core/domain/effects/GameEffects";
import {
	ConversationContext,
	ConversationOutcome,
	evaluateConversation,
	TRUST_DELTA,
} from "../core/domain/npc/Conversation";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import { NpcConversationProfile } from "../core/domain/npc/NpcProfile";
import { resolveTopic } from "../core/domain/npc/TopicRegistry";
import { moveToNpc } from "./helpers/placePlayer";

/**
 * Every conversation moves trust: a little for a neutral one, more for a good
 * one, and a loss for a deflection or a refusal.
 */

const NPC_ID = "test_npc";

function profile(overrides: Partial<NpcConversationProfile> = {}) {
	return {
		npcId: NPC_ID,
		traits: [],
		hardBoundaries: [],
		topicAffinities: {},
		...overrides,
	} satisfies NpcConversationProfile;
}

function evaluate(
	options: {
		topic?: string;
		relationship?: Partial<RelationshipStats>;
		profile?: NpcConversationProfile;
		isPrivate?: boolean;
		flags?: ConversationContext["flags"];
	} = {},
): ConversationOutcome {
	const ctx: ConversationContext = {
		npcId: NPC_ID,
		topic: options.topic,
		topicDef: resolveTopic(options.topic),
		npcProfile: options.profile,
		isPrivate: options.isPrivate ?? false,
		locationId: "somewhere",
		relationship: Object.assign(new RelationshipStats(), options.relationship),
		flags: options.flags ?? {},
		recentHistory: [],
		recentFacts: [],
		turnIndex: 0,
	};
	return evaluateConversation(ctx);
}

const trustOf = (effects: GameEffect[]): number =>
	effects.reduce(
		(total, effect) =>
			effect.type === "RelationshipDelta" && effect.npcId === NPC_ID
				? total + (effect.delta.trust ?? 0)
				: total,
		0,
	);

describe("trust table", () => {
	it("is the agreed one", () => {
		expect(TRUST_DELTA).toEqual({
			partial: 0.5,
			success: 2,
			reveal: 2,
			invitation: 2,
			deflection: -1,
			refusal: -2,
		});
	});
});

describe("trust change per conversation outcome", () => {
	const liked = profile({ topicAffinities: { daily_chat: 2 } });

	it("partial: a plain chat builds a little trust", () => {
		const outcome = evaluate();
		expect(outcome.result).toBe("partial");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.partial);
	});

	it("success: a good conversation builds more", () => {
		const outcome = evaluate({ topic: "daily_chat", profile: liked });
		expect(outcome.result).toBe("success");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.success);
	});

	it("reveal: builds trust", () => {
		const outcome = evaluate({
			topic: "daily_chat",
			profile: profile({ topicAffinities: { daily_chat: 1 } }),
			relationship: { trust: 40 },
		});
		expect(outcome.result).toBe("reveal");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.reveal);
	});

	it("a very good conversation outside a private place builds the same", () => {
		const outcome = evaluate({
			topic: "daily_chat",
			profile: liked,
			relationship: { trust: 40, affection: 30 },
		});
		expect(outcome.result).toBe("reveal");
		expect(outcome.score).toBeGreaterThanOrEqual(4);
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.reveal);
	});

	it("invitation: builds trust", () => {
		const outcome = evaluate({
			topic: "daily_chat",
			profile: profile({ topicAffinities: { daily_chat: 0 } }),
			relationship: { trust: 40, affection: 30 },
			isPrivate: true,
		});
		expect(outcome.result).toBe("invitation");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.invitation);
	});

	it("deflection because the topic needs more trust: costs trust", () => {
		const outcome = evaluate({ topic: "dark_arts" });
		expect(outcome.result).toBe("deflection");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.deflection);
	});

	it("deflection because the topic suits the NPC badly: costs trust", () => {
		const outcome = evaluate({
			topic: "daily_chat",
			profile: profile({ topicAffinities: { daily_chat: -2 } }),
		});
		expect(outcome.result).toBe("deflection");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.deflection);
	});

	it("refusal at a hard boundary: costs more trust", () => {
		const outcome = evaluate({
			topic: "dark_arts",
			profile: profile({ hardBoundaries: ["dark_arts"] }),
		});
		expect(outcome.result).toBe("refusal");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.refusal);
	});

	it("refusal because the NPC is hostile: costs more trust", () => {
		const outcome = evaluate({ relationship: { resentment: 40 } });
		expect(outcome.result).toBe("refusal");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.refusal);
	});

	it("refusal for pressing a topic that was just deflected: costs more trust", () => {
		const outcome = evaluate({
			topic: "daily_chat",
			flags: { [`deflected.${NPC_ID}.daily_chat`]: true },
		});
		expect(outcome.result).toBe("refusal");
		expect(trustOf(outcome.effects)).toBe(TRUST_DELTA.refusal);
	});

	it("keeps the resentment a refusal already caused", () => {
		const outcome = evaluate({
			topic: "dark_arts",
			profile: profile({ hardBoundaries: ["dark_arts"] }),
		});
		const resentment = outcome.effects.reduce(
			(total, effect) =>
				effect.type === "RelationshipDelta"
					? total + (effect.delta.resentment ?? 0)
					: total,
			0,
		);
		expect(resentment).toBe(1);
	});
});

describe("relationship record", () => {
	let registry: Registry;
	let state: GameState;
	let resolver: TurnResolver;

	beforeAll(() => {
		jest.spyOn(console, "log").mockImplementation();
		registry = buildRegistry();
	});
	afterAll(() => jest.restoreAllMocks());
	beforeEach(() => {
		state = new GameState();
		resolver = new TurnResolver(createGameBus());
	});

	it("the first talk creates it, with the trust the outcome earns", () => {
		expect(state.relationships["hagrid"]).toBeUndefined();
		moveToNpc(state, registry, "hagrid");

		resolver.apply({ type: "TALK", npcId: "hagrid" }, state, registry);

		expect(state.relationships["hagrid"]).toBeInstanceOf(RelationshipStats);
		expect(state.relationships["hagrid"].trust).toBe(TRUST_DELTA.partial);
	});

	it("later talks add to it", () => {
		moveToNpc(state, registry, "hagrid");
		for (let i = 0; i < 3; i++) {
			resolver.apply({ type: "TALK", npcId: "hagrid" }, state, registry);
		}
		expect(state.relationships["hagrid"].trust).toBe(
			3 * TRUST_DELTA.partial,
		);
	});

	it("trust cannot fall below -100", () => {
		state.relationships[NPC_ID] = Object.assign(new RelationshipStats(), {
			trust: -99,
		});
		applyEffects(state, [relationshipDelta(NPC_ID, { trust: -2 }, "test")]);
		expect(state.relationships[NPC_ID].trust).toBe(-100);
	});
});
