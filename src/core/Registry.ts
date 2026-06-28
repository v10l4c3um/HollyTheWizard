import Location from "./domain/world/Location";
import NPC from "./domain/npc/Npc";
import Item from "./domain/world/Item";
import { Spell } from "./domain/magic/Spell";

class Registry {
	private locations = new Map<string, Location>();
	private npcs = new Map<string, NPC>();
	private items = new Map<string, Item>();
	private spells = new Map<string, Spell>();

	registerLocation(location: Location): void {
		this.locations.set(location.id, location);
	}

	registerNPC(npc: NPC): void {
		this.npcs.set(npc.id, npc);
	}

	registerItem(item: Item): void {
		this.items.set(item.id, item);
	}

	registerSpell(spell: Spell): void {
		this.spells.set(spell.definition.id, spell);
	}

	getLocation(id: string): Location | undefined {
		return this.locations.get(id);
	}

	getNPC(id: string): NPC | undefined {
		return this.npcs.get(id);
	}

	getItem(id: string): Item | undefined {
		return this.items.get(id);
	}

	getSpell(id: string): Spell | undefined {
		return this.spells.get(id);
	}
}

export default Registry;
