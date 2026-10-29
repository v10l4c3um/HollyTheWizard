import Location from "./domain/world/Location";
import NPC from "./domain/npc/Npc";
import Item from "./domain/world/Item";
import { Spell } from "./domain/magic/Spell";
import {
	SchoolData,
	SubjectType,
	SubjectCurriculum,
	WeeklyTimetable,
} from "./domain/quest/Curriculum";
import { NpcConversationProfile } from "./domain/npc/NpcProfile";
import { deepFreeze } from "./content/deepFreeze";

class Registry {
	private locations = new Map<string, Location>();
	private npcs = new Map<string, NPC>();
	private npcProfiles = new Map<string, NpcConversationProfile>();
	private items = new Map<string, Item>();
	private spells = new Map<string, Spell>();
	private schoolData: SchoolData | null = null;

	private frozen = false;

	/** True once `freeze()` has been called: content can no longer change. */
	get isFrozen(): boolean {
		return this.frozen;
	}

	/**
	 * Ends loading. From now on registering anything throws, and every stored
	 * entry is deep-frozen, so content the registry hands out cannot be
	 * changed by accident (the compiler does not enforce this; it is checked
	 * at runtime).
	 */
	freeze(): void {
		this.frozen = true;
		for (const map of [this.locations, this.npcs, this.npcProfiles, this.items, this.spells]) {
			for (const entry of map.values()) deepFreeze(entry);
		}
		deepFreeze(this.schoolData);
	}

	private add<T>(map: Map<string, T>, kind: string, id: string, entry: T): void {
		if (this.frozen) {
			throw new Error(`Registry is frozen: cannot register ${kind} "${id}"`);
		}
		if (map.has(id)) {
			throw new Error(`Duplicate ${kind} id "${id}"`);
		}
		map.set(id, entry);
	}

	registerLocation(location: Location): void {
		this.add(this.locations, "location", location.id, location);
	}

	registerNPC(npc: NPC): void {
		this.add(this.npcs, "NPC", npc.id, npc);
	}

	registerNpcProfile(profile: NpcConversationProfile): void {
		this.add(this.npcProfiles, "NPC profile", profile.npcId, profile);
	}

	getNpcProfile(id: string): NpcConversationProfile | undefined {
		return this.npcProfiles.get(id);
	}

	getAllNpcProfileIds(): string[] {
		return Array.from(this.npcProfiles.keys());
	}

	registerItem(item: Item): void {
		this.add(this.items, "item", item.id, item);
	}

	registerSpell(spell: Spell): void {
		this.add(this.spells, "spell", spell.definition.id, spell);
	}

	getLocation(id: string): Location | undefined {
		return this.locations.get(id);
	}

	getNPC(id: string): NPC | undefined {
		return this.npcs.get(id);
	}

	getAllNpcIds(): string[] {
		return Array.from(this.npcs.keys());
	}

	getAllLocationIds(): string[] {
		return Array.from(this.locations.keys());
	}

	getItem(id: string): Item | undefined {
		return this.items.get(id);
	}

	getSpell(id: string): Spell | undefined {
		return this.spells.get(id);
	}

	getAllSpellIds(): string[] {
		return Array.from(this.spells.keys());
	}

	registerSchoolData(data: SchoolData): void {
		if (this.frozen) throw new Error("Registry is frozen: cannot register school data");
		if (this.schoolData) throw new Error("Duplicate school data");
		this.schoolData = data;
	}

	getSchoolData(): SchoolData | null {
		return this.schoolData;
	}

	getTimetable(year: number): WeeklyTimetable | undefined {
		return this.schoolData?.timetables.find((t) => t.year === year);
	}

	getCurriculumForSubject(
		subject: SubjectType,
		year: number,
	): SubjectCurriculum | undefined {
		if (!this.schoolData) {
			return undefined;
		}
		return this.schoolData.curriculums.find(
			(c) => c.subjectType === subject && c.year === year,
		);
	}
}

export default Registry;
