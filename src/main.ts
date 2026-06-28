import { GameEngine } from "./core/engine/GameEngine";
import Registry from "./core/Registry";
import Location from "./core/domain/world/Location";
import { CliApp } from "./ui/cli/App";
import NPC from "./core/domain/npc/Npc";

// Seed registry with starter world data
const registry = new Registry();

registry.registerLocation(
	new Location(
		"startingVillage",
		"Starting Village",
		"A quiet village at the edge of an ancient forest. Cobblestone paths wind between thatched-roof cottages.",
		["forest", "market"],
	),
);

registry.registerLocation(
	new Location(
		"forest",
		"Ancient Forest",
		"Towering oaks block out much of the sky. The air smells of moss and old magic.",
		["startingVillage"],
	),
);

registry.registerLocation(
	new Location(
		"market",
		"Market Square",
		"A bustling square lined with merchant stalls selling herbs, potions, and curious artifacts.",
		["startingVillage"],
	),
);

registry.registerNPC(
	new NPC(
		"villager",
		"Villager",
		["A friendly villager who seems eager to chat."],
		0,
	),
);

const engine = new GameEngine(registry);
const app = new CliApp(engine);
app.start();
