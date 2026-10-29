import Registry from "../../Registry";
import { Ref } from "../../domain/facts/TurnFact";

export function spellRef(registry: Registry, id: string): Ref {
	return { id, name: registry.getSpell(id)?.definition.name || id };
}
