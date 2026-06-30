# Content System Documentation

## Overview

The Content System provides a flexible, data-driven approach to defining game content without modifying source code. Content is organized into **packs** (JSON files) and loaded at startup via the **ContentLoader**.

## Architecture

### ContentLoader

**Location:** `src/core/content/ContentLoader.ts`

The `ContentLoader` class is responsible for:

- Discovering content pack files in the designated directory
- Parsing JSON manifests
- Registering content into the Registry

**Public Methods:**

```typescript
loadSpellPack(packName: string, registry: Registry): void
```

Loads a single spell pack by name. Throws if file not found.

```typescript
loadAllSpellPacks(registry: Registry): void
```

Loads all `.json` files from the content pack directory. Logs warnings for missing files or parsing errors, but doesn't crash.

**Constructor:**

```typescript
new ContentLoader(packDirectory?: string)
```

Defaults to `src/content/packs/` if not specified.

### Content Pack Structure

A content pack is a JSON file with a manifest structure:

```json
{
	"name": "Pack Display Name",
	"version": "1.0.0",
	"description": "Optional description",
	"spells": [
		{
			/* spell definitions */
		}
	]
}
```

## Spell Packs

### File Location

Spell packs go in: `src/content/packs/`

Files must be named `*.json` and are loaded in alphabetical order.

### Spell Schema

Each spell in a pack must match the `Spell` interface:

```typescript
interface Spell {
	id: string; // Unique identifier (used in STUDY commands)
	name: string; // Display name
	description: string; // Flavor text and gameplay description
	manaCost: number; // Base mana required to cast
	level: SpellLevel; // Difficulty level: 1-4 (Novice, Apprentice, Adept, Expert)
	requiredConditions: []; // Future: conditions needed to learn/cast
	usageType: string; // "combat" | "utility" | "passive"
	learningDifficulty: number; // 0.0 to 1.0 (how hard to learn)
	practiceRequirement: number; // Number of successful uses to gain proficiency
	range: string; // "self" | "touch" | "short" | "ranged"
	targetType: string; // "self" | "single" | "group" | "area" | "passive"
	backfireRisk: string; // "none" | "low" | "medium" | "high"
	scaling: {
		// Attribute-based scaling factors
		[attributeName]: number;
	};
	visuals?: string; // Description of visual effects
	sound?: string; // Sound effect reference
	loreTag?: string; // Thematic tag (e.g., "fire_magic", "ancient_curse")
}
```

### Spell Level Reference

| Level | Name       | Learning Difficulty Range | Example                      |
| ----- | ---------- | ------------------------- | ---------------------------- |
| 1     | Novice     | 0.0 - 0.3                 | Arcane Missile, Heal, Shield |
| 2     | Apprentice | 0.3 - 0.5                 | Fireball, Frostbolt          |
| 3     | Adept      | 0.5 - 0.7                 | Chain Lightning, Teleport    |
| 4     | Expert     | 0.7 - 1.0                 | Meteor Strike                |

### Default Spell Packs

#### `spells.json` - Core Spells

8 foundational spells available to all wizards:

- **Combat:** Fireball, Frostbolt, Arcane Missile
- **Utility:** Heal, Shield, Magelight
- **Advanced:** Meteor Strike, Time Warp

#### `spells_advanced.json` - Advanced Spells

4 higher-tier spells for experienced players:

- **Combat:** Chain Lightning
- **Utility:** Teleport, Summon Familiar, Arcane Reflection

## Usage Examples

### In Code: Loading Content

```typescript
import ContentLoader from "./core/content/ContentLoader";
import Registry from "./core/Registry";

const registry = new Registry();
const contentLoader = new ContentLoader();

// Load all packs from the default directory
contentLoader.loadAllSpellPacks(registry);

// Or load a specific pack
contentLoader.loadSpellPack("spells", registry);
```

### In Game: Learning Spells

Players study spells via the `STUDY` command:

```
study fireball 1        // Study Fireball for 1 hour (30 minutes of game time)
study chain_lightning   // Study Chain Lightning for default duration
```

The TurnResolver checks the Registry and provides feedback:

- If the spell exists but isn't known: "You haven't learned Fireball yet."
- If the spell is learned: "You spent 1 hour(s) studying Fireball. You feel more proficient now."
- If the spell doesn't exist: "There is no spell with id 'invalid_spell'."

## Creating New Spell Packs

### Step 1: Create a JSON file

Create `src/content/packs/your_pack.json`:

```json
{
	"name": "Your Pack Name",
	"version": "1.0.0",
	"description": "What this pack contains",
	"spells": [
		{
			"id": "your_spell_id",
			"name": "Your Spell Name",
			"description": "Flavor and mechanics description",
			"manaCost": 25,
			"level": 2,
			"requiredConditions": [],
			"usageType": "combat",
			"learningDifficulty": 0.4,
			"practiceRequirement": 15,
			"range": "ranged",
			"targetType": "single",
			"backfireRisk": "low",
			"scaling": {
				"intellect": 0.8
			}
		}
	]
}
```

### Step 2: Test

Restart the app; the pack will be automatically loaded:

```
npm run start
```

Look for output like:

```
Loaded spell pack 'Your Pack Name' with 1 spells
```

### Step 3: Verify

Test the spell:

```
study your_spell_id
```

## Design Patterns

### Balancing Learning Difficulty

- **Easy (0.0 - 0.2):** Beginner spells, few resource costs
- **Moderate (0.3 - 0.5):** Mid-tier spells, balanced
- **Hard (0.6 - 0.8):** Advanced spells, higher risk/reward
- **Very Hard (0.8 - 1.0):** Expert spells, powerful but dangerous

### Practice Requirements

Generally correlate with difficulty:

- Novice spells: 3 - 10 practices
- Apprentice spells: 10 - 20 practices
- Adept spells: 25 - 35 practices
- Expert spells: 35 - 50 practices

### Scaling Examples

Scaling determines how character attributes affect spell effectiveness:

```json
// Intellect-heavy spell
"scaling": { "intellect": 0.9, "focus": 0.3 }

// Balanced intelligence and empathy (for healing)
"scaling": { "intellect": 0.6, "empathy": 0.4 }

// Pure intellect (time/space manipulation)
"scaling": { "intellect": 1.0 }
```

## Future Enhancements

The content system is designed to be extensible:

### Planned Additions

1. **Item Packs** - Equipment, consumables, crafting materials
2. **NPC Packs** - Dialogue trees, quest givers, merchants
3. **Location Packs** - World regions, dungeons, procedural content
4. **Event Packs** - Encounters, weather, seasonal events

### Required Conditions

The `requiredConditions` field is currently unused but designed for:

- Class/role requirements
- Attribute minimums
- Environmental triggers
- Story/progression gates

## Troubleshooting

### Spells not loading

**Check:**

1. File is in `src/content/packs/` and ends with `.json`
2. JSON syntax is valid (use a JSON validator)
3. Console output shows "Loaded spell pack..." message

### Spell ID not recognized in STUDY command

**Check:**

1. The `id` field in the JSON matches exactly (case-sensitive)
2. Pack was loaded (check console on startup)
3. Spell is in the Registry (not just in a JSON file with no Loader call)

### TypeScript compilation errors

**Check:**

1. ContentLoader is imported in main.ts
2. `loadAllSpellPacks()` is called during initialization
3. JSON files are present and readable

## Performance Notes

- All packs are loaded synchronously at startup
- No lazy-loading; consider grouping related spells into single packs
- For 1000+ spells, consider splitting into multiple packs (5-10 each)
- Pack loading is logged to console for debugging

## File Structure

```
src/
├── content/
│   └── packs/
│       ├── spells.json                 # Core spells
│       ├── spells_advanced.json        # Advanced spells
│       ├── npcs.json                   # Core NPCs
│       └── (your new packs go here)
├── core/
│   ├── content/
│   │   └── ContentLoader.ts            # Loader implementation
│   └── domain/
│       └── magic/
│           └── SpellBook.ts            # Spell interface
└── main.ts                             # Initializes ContentLoader
```

## NPC Content Packs

NPC content packs allow you to define non-player characters (NPCs) with unique names, dialogues, and affiliations that can be used in the wizarding world.

### Structure

An NPC content pack is a JSON file with the following structure:

```json
{
	"name": "Pack Name",
	"version": "1.0.0",
	"description": "Description of the pack",
	"npcs": [
		{
			"id": "unique_npc_id",
			"name": "NPC Name",
			"dialogue": ["Dialogue line 1", "Dialogue line 2"],
			"affinity": 50
		}
	]
}
```

### Usage Examples

### In Code: Loading Content

```typescript
import ContentLoader from "./core/content/ContentLoader";
import Registry from "./core/Registry";

const registry = new Registry();
const contentLoader = new ContentLoader();

// Load all packs from the default directory (including NPC packs)
contentLoader.loadAllSpellPacks(registry);
contentLoader.loadAllNpcPacks(registry);

// Or load a specific pack
contentLoader.loadSpellPack("spells", registry);
contentLoader.loadNpcPack("npcs", registry);
```

### In Game: Interacting with NPCs

Players can interact with NPCs through various dialogue commands in the game.

## Creating New NPC Packs

### Step 1: Create a JSON file

Create `src/content/packs/your_npc_pack.json`:

```json
{
	"name": "Your NPC Pack",
	"version": "1.0.0",
	"description": "Description of your NPC pack",
	"npcs": [
		{
			"id": "your_npc_id",
			"name": "Your NPC Name",
			"dialogue": ["Dialogue line 1", "Dialogue line 2"],
			"affinity": 50
		}
	]
}
```

### Step 2: Add to the Registry

The ContentLoader will automatically register NPCs from packs into the Registry.

## Troubleshooting

### NPCs not loading

**Check:**

1. File is in `src/content/packs/` and ends with `.json`
2. JSON syntax is valid (use a JSON validator)
3. Console output shows "Loaded NPC pack..." message

### NPC ID not recognized in-game

**Check:**

1. The `id` field in the JSON matches exactly (case-sensitive)
2. Pack was loaded (check console on startup)
3. NPC is in the Registry (not just in a JSON file with no Loader call)

## Performance Notes

- All NPC packs are loaded synchronously at startup
- No lazy-loading; consider grouping related NPCs into single packs
- For 100+ NPCs, consider splitting into multiple packs (5-10 each)
- Pack loading is logged to console for debugging
