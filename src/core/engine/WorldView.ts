import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { npcsAt } from "../domain/npc/Presence";
import { activeClass } from "../domain/quest/Timetable";
import type { Command } from "../domain/commands/CommandDefinitions";

export interface NamedEntity {
	id: string;
	name: string;
	aliases?: string[];
	/** A short description, shown when the model has to choose between several. */
	description?: string;
}

/** A turn the player took lately, described with real names. */
export interface RecentTurnView {
	input: string;
	/** "talked to Hermione Granger (hermione_granger)" */
	summary: string;
	command: Command;
	fromLocationId: string;
}

export interface WorldSpell extends NamedEntity {
	learned: boolean;
}

/**
 * What the player can see and name this turn, as plain data. It grounds the
 * language model (closed lists to choose from) and the matcher that checks
 * whatever the model answers.
 */
export interface WorldView {
	playerName: string;
	location: NamedEntity;
	/** Places connected to here that the player has discovered: where they can go now. */
	exits: NamedEntity[];
	/** Every place in the game, so a refusal can say "not from here" rather than "unknown". */
	places: NamedEntity[];
	peopleHere: NamedEntity[];
	people: NamedEntity[];
	subjects: NamedEntity[];
	/** The class being held right now, if any. */
	classNow?: NamedEntity;
	spells: WorldSpell[];
	items: NamedEntity[];
	/** The last few in-world turns, newest last. */
	recent: RecentTurnView[];
	/** The newest real thing of each kind the player dealt with: what "him", "there", "it" mean. */
	lastPerson?: NamedEntity;
	lastPlace?: NamedEntity;
	lastSubject?: NamedEntity;
	lastSpell?: NamedEntity;
	lastItem?: NamedEntity;
}

export function buildWorldView(registry: Registry, state: GameState): WorldView {
	const view = buildStaticWorldView(registry);
	const here = registry.getLocation(state.currentLocationId);

	const named = (id: string): NamedEntity => ({
		id,
		name: registry.getLocation(id)?.displayName ?? id,
		aliases: registry.getLocation(id)?.aliases ?? [],
		description: shortDescription(registry.getLocation(id)?.description),
	});

	const slot = activeClass(
		registry.getTimetable(state.currentYear),
		state.worldClock.getWeekday(),
		state.worldClock.timeOfDay,
	);
	const classNow = slot?.subject
		? view.subjects.find((subject) => subject.id === slot.subject)
		: undefined;

	return {
		...view,
		playerName: state.player.name,
		location: here
			? { id: here.id, name: here.displayName }
			: { id: state.currentLocationId, name: state.currentLocationId },
		exits: (here?.connectedLocationsIds ?? [])
			.filter((id) => state.discoveredLocationIds.includes(id))
			.map(named),
		peopleHere: npcsAt(registry, state).map((npc) => ({
			id: npc.id,
			name: npc.name,
			aliases: npc.aliases ?? [],
			description: npc.tag_description,
		})),
		classNow,
		spells: view.spells.map((spell) => {
			const knowledge = state.spellbook.getSpellState(spell.id)?.knowledgeState;
			return { ...spell, learned: knowledge === "learned" || knowledge === "mastered" };
		}),
		items: state.inventory.items.map((item) => ({ id: item.id, name: item.name })),
		...recentPast(registry, state, view),
	};
}

type RecentPast = Pick<
	WorldView,
	"recent" | "lastPerson" | "lastPlace" | "lastSubject" | "lastSpell" | "lastItem"
>;

/** The remembered turns with names, and what the newest of each kind refers to. */
function recentPast(
	registry: Registry,
	state: GameState,
	base: WorldView,
): RecentPast {
	const person = (id: string) => base.people.find((p) => p.id === id);
	const place = (id: string) => base.places.find((p) => p.id === id);
	const subject = (id: string) => base.subjects.find((s) => s.id === id);
	const spell = (id: string) => base.spells.find((s) => s.id === id);
	const item = (id: string) =>
		state.inventory.items.find((i) => i.id === id)
			? { id, name: state.inventory.items.find((i) => i.id === id)!.name }
			: undefined;
	const tag = (e: NamedEntity | undefined) => (e ? `${e.name} (${e.id})` : undefined);

	const recent: RecentTurnView[] = state.recentTurns.map((turn) => {
		const c = turn.command;
		let summary: string;
		switch (c.type) {
			case "MOVE":
				summary = `went to ${tag(place(c.destinationId)) ?? c.destinationId}`;
				break;
			case "TALK":
				summary = `talked to ${tag(person(c.npcId)) ?? c.npcId}`;
				break;
			case "STUDY":
				summary = `studied ${tag(subject(c.subjectId)) ?? c.subjectId}`;
				break;
			case "ATTEND_CLASS":
				summary = `attended ${tag(subject(c.subjectId)) ?? c.subjectId} class`;
				break;
			case "PRACTICE":
				summary = `practised ${tag(spell(c.spellId)) ?? c.spellId}`;
				break;
			case "INTERACT":
				summary = `used ${tag(item(c.itemId)) ?? c.itemId}`;
				break;
			case "REST":
				summary = `rested for ${c.duration} hour${c.duration === 1 ? "" : "s"}`;
				break;
			default:
				summary = c.type.toLowerCase();
		}
		return { input: turn.input, summary, command: c, fromLocationId: turn.fromLocationId };
	});

	const past: RecentPast = { recent };
	for (const { command: c } of [...recent].reverse()) {
		if (c.type === "TALK" && !past.lastPerson) past.lastPerson = person(c.npcId);
		if (c.type === "MOVE" && !past.lastPlace) past.lastPlace = place(c.destinationId);
		if ((c.type === "STUDY" || c.type === "ATTEND_CLASS") && !past.lastSubject) {
			past.lastSubject = subject(c.subjectId);
		}
		if (c.type === "PRACTICE" && !past.lastSpell) past.lastSpell = spell(c.spellId);
		if (c.type === "INTERACT" && !past.lastItem) past.lastItem = item(c.itemId);
	}
	return past;
}

/** The parts of the view that come from content alone (no game state). */
export function buildStaticWorldView(registry: Registry): WorldView {
	const people = registry.getAllNpcIds().flatMap((id) => {
		const npc = registry.getNPC(id);
		return npc
			? [
					{
						id: npc.id,
						name: npc.name,
						aliases: npc.aliases ?? [],
						description: npc.tag_description,
					},
				]
			: [];
	});
	const schoolData = registry.getSchoolData();

	return {
		playerName: "Player",
		location: { id: "", name: "" },
		exits: [],
		places: registry.getAllLocationIds().map((id) => ({
			id,
			name: registry.getLocation(id)?.displayName ?? id,
			aliases: registry.getLocation(id)?.aliases ?? [],
			description: shortDescription(registry.getLocation(id)?.description),
		})),
		peopleHere: [],
		people,
		subjects: Object.entries(schoolData?.subjects ?? {}).map(([id, subject]) => ({
			id,
			name: (subject as { name: string }).name,
		})),
		spells: registry.getAllSpellIds().map((id) => ({
			id,
			name: registry.getSpell(id)?.definition.name ?? id,
			description: shortDescription(registry.getSpell(id)?.definition.description),
			learned: false,
		})),
		items: [],
		recent: [],
	};
}

/** The first sentence, kept short, so lists stay readable. */
function shortDescription(text: string | undefined): string | undefined {
	if (!text) return undefined;
	const first = text.split(/(?<=[.!?])\s/)[0];
	return first.length > 90 ? `${first.slice(0, 87)}...` : first;
}
