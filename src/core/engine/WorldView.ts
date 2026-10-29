import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { npcsAt } from "../domain/npc/Presence";
import { activeClass } from "../domain/quest/Timetable";

export interface NamedEntity {
	id: string;
	name: string;
	aliases?: string[];
	/** A short description, shown when the model has to choose between several. */
	description?: string;
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
}

export function buildWorldView(registry: Registry, state: GameState): WorldView {
	const view = buildStaticWorldView(registry);
	const here = registry.getLocation(state.currentLocationId);

	const named = (id: string): NamedEntity => ({
		id,
		name: registry.getLocation(id)?.displayName ?? id,
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
	};
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
	};
}

/** The first sentence, kept short, so lists stay readable. */
function shortDescription(text: string | undefined): string | undefined {
	if (!text) return undefined;
	const first = text.split(/(?<=[.!?])\s/)[0];
	return first.length > 90 ? `${first.slice(0, 87)}...` : first;
}
