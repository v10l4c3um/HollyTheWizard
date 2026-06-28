# Quick Guide: Adding Spells

## TL;DR

1. Edit `src/content/packs/spells.json` (or create a new pack)
2. Add a spell object to the `"spells"` array
3. Restart the app (`npm run start`)
4. Test with `study <spell_id>`

## Spell Template

Copy-paste this and fill in your values:

```json
{
  "id": "spell_short_name",
  "name": "Spell Display Name",
  "description": "What the spell does and how it feels.",
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
  },
  "visuals": "A description of what you see",
  "sound": "reference-to-sound",
  "loreTag": "thematic_tag"
}
```

## Field Guide

### Core Fields (Required)

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `id` | string | `"fireball"` | Used in STUDY commands. Use lowercase with underscores. |
| `name` | string | `"Fireball"` | Display name (can have spaces and capitals). |
| `description` | string | `"A ball of flame..."` | Flavor text explaining the spell. |
| `manaCost` | number | `30` | Mana required to cast. |
| `level` | number | `2` | 1=Novice, 2=Apprentice, 3=Adept, 4=Expert. |

### Combat/Utility Classification

| Field | Type | Example | Options |
|-------|------|---------|---------|
| `usageType` | string | `"combat"` | `"combat"` \| `"utility"` \| `"passive"` |
| `range` | string | `"ranged"` | `"self"` \| `"touch"` \| `"short"` \| `"ranged"` |
| `targetType` | string | `"single"` | `"self"` \| `"single"` \| `"group"` \| `"area"` \| `"passive"` |
| `backfireRisk` | string | `"low"` | `"none"` \| `"low"` \| `"medium"` \| `"high"` |

### Learning & Progression

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `learningDifficulty` | number | `0.4` | 0.0 to 1.0. Higher = harder to learn. |
| `practiceRequirement` | number | `15` | How many uses to gain proficiency. |
| `requiredConditions` | array | `[]` | Future feature. Leave empty for now. |

### Advanced

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `scaling` | object | `{"intellect": 0.8}` | How attributes affect power. Sum shouldn't exceed 1.5. |
| `visuals` | string | `"Blue lightning"` | Flavor (optional). |
| `sound` | string | `"crackle"` | Sound effect reference (optional). |
| `loreTag` | string | `"storm_magic"` | Thematic category (optional). |

## Common Patterns

### Combat Spell
```json
{
  "id": "lightning_bolt",
  "name": "Lightning Bolt",
  "description": "A searing bolt of electricity strikes the target.",
  "manaCost": 40,
  "level": 2,
  "usageType": "combat",
  "learningDifficulty": 0.45,
  "practiceRequirement": 18,
  "range": "ranged",
  "targetType": "single",
  "backfireRisk": "low",
  "scaling": { "intellect": 0.9 }
}
```

### Healing Spell
```json
{
  "id": "greater_heal",
  "name": "Greater Heal",
  "description": "Restores significant vitality to a wounded ally.",
  "manaCost": 35,
  "level": 2,
  "usageType": "utility",
  "learningDifficulty": 0.5,
  "practiceRequirement": 20,
  "range": "touch",
  "targetType": "single",
  "backfireRisk": "none",
  "scaling": { "intellect": 0.6, "empathy": 0.4 }
}
```

### Area Spell
```json
{
  "id": "inferno",
  "name": "Inferno",
  "description": "Creates a massive blast of flame that engulfs everything nearby.",
  "manaCost": 60,
  "level": 3,
  "usageType": "combat",
  "learningDifficulty": 0.65,
  "practiceRequirement": 28,
  "range": "short",
  "targetType": "area",
  "backfireRisk": "medium",
  "scaling": { "intellect": 1.0 }
}
```

### Self-Buff Spell
```json
{
  "id": "temporal_acceleration",
  "name": "Temporal Acceleration",
  "description": "You move and act faster than normal for a short duration.",
  "manaCost": 30,
  "level": 2,
  "usageType": "utility",
  "learningDifficulty": 0.55,
  "practiceRequirement": 22,
  "range": "self",
  "targetType": "self",
  "backfireRisk": "low",
  "scaling": { "intellect": 0.7, "focus": 0.3 }
}
```

## Adding to Existing Packs

### Option 1: Edit `spells.json` Directly
Edit `src/content/packs/spells.json` and add your spell to the `"spells"` array:

```json
{
  "name": "Core Spells",
  "version": "1.0.0",
  "spells": [
    { /* existing spells */ },
    {
      "id": "your_new_spell",
      "name": "Your New Spell",
      /* ... */
    }
  ]
}
```

### Option 2: Create a New Pack
Create `src/content/packs/spells_custom.json`:

```json
{
  "name": "Custom Spells",
  "version": "1.0.0",
  "description": "My custom spells",
  "spells": [
    {
      "id": "custom_spell_1",
      /* ... */
    }
  ]
}
```

It will auto-load!

## Testing Your Spell

After editing and restarting:

```
$ npm run start
...
Loaded spell pack 'Core Spells' with 9 spells
...

> study your_new_spell
```

You should see a message confirming you studied the spell.

## Spell Naming Conventions

Use these prefixes to categorize spells visually:

- **Fire spells:** `fireball`, `inferno`, `flame_strike`
- **Frost spells:** `frostbolt`, `ice_storm`, `freeze`
- **Lightning spells:** `lightning_bolt`, `chain_lightning`, `arc`
- **Healing spells:** `heal`, `greater_heal`, `restoration`
- **Utility spells:** `shield`, `teleport`, `magelight`
- **Buffs:** `haste`, `strength_boost`, `mana_shield`
- **Debuffs:** `weaken`, `curse`, `silence`

## Validation Checklist

Before saving, verify:
- [ ] `id` is lowercase with underscores (e.g., `chain_lightning`)
- [ ] `name` is title-cased (e.g., `Chain Lightning`)
- [ ] All required fields are present
- [ ] `level` is 1, 2, 3, or 4
- [ ] `learningDifficulty` is 0.0 to 1.0
- [ ] `manaCost` is positive
- [ ] `practiceRequirement` is positive and matches difficulty
- [ ] JSON syntax is valid (no trailing commas, quotes matched)
- [ ] `usageType` is one of: combat, utility, passive
- [ ] `range` is one of: self, touch, short, ranged
- [ ] `targetType` is one of: self, single, group, area, passive

## Common Mistakes

❌ **Wrong:** Trailing comma in JSON
```json
{
  "id": "spell",
  "name": "Spell",
  // ERROR! ↓
  "level": 2,
}
```

✅ **Right:** No trailing comma
```json
{
  "id": "spell",
  "name": "Spell",
  "level": 2
}
```

---

❌ **Wrong:** ID with spaces or capitals
```json
"id": "My New Spell"
```

✅ **Right:** Lowercase with underscores
```json
"id": "my_new_spell"
```

---

❌ **Wrong:** Difficulty outside 0-1 range
```json
"learningDifficulty": 1.5
```

✅ **Right:** Within 0-1
```json
"learningDifficulty": 0.75
```

## Getting Help

- Check existing spells in `src/content/packs/spells.json`
- Read the full guide: `docs/CONTENT_SYSTEM.md`
- Console shows which packs loaded on startup
