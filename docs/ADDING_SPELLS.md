# Quick Guide: Adding Spells

## TL;DR

1. Add a spell to a pack in `src/content/spells/` (or create a new pack there).
2. Run `npm run lint:content`. It prints `file:line:col` for anything wrong.
3. Start the game (`npm run start`) and test with `study <spell name>` or `practice <spell name>`.

## Spell template

A spell has a `definition` (what it is) and `balance` (how it progresses). Copy this and fill it in:

```json
{
  "definition": {
    "id": "spell_short_name",
    "name": "Spell Display Name",
    "description": "What the spell does and how it feels.",
    "level": "novice",
    "usageType": "utility",
    "range": "short",
    "targetType": "single",
    "revealCondition": { "type": "location", "value": "library", "source": "found in a book" },
    "visuals": "A soft glow",
    "sound": "hum",
    "loreTag": "light_magic"
  },
  "balance": {
    "manaCost": 10,
    "backfireRisk": "low",
    "learningDifficulty": 0.3,
    "practiceRequirement": 5,
    "scaling": { "intellect": 0.5 }
  }
}
```

Allowed values:

| Field | Values |
|---|---|
| `level` | `unknown`, `novice`, `apprentice`, `advanced`, `expert` |
| `usageType` | `combat`, `utility`, `passive` |
| `range` | `self`, `touch`, `short`, `ranged` |
| `targetType` | `self`, `single`, `group`, `area`, `passive` |
| `backfireRisk` | `none`, `low`, `medium`, `high` |
| `learningDifficulty` | 0 to 1 |
| `revealCondition` / `castCondition` | optional `{ type: quest | attribute | item | location, value, source? }`; a `location` must be a real place |

Unknown keys are errors (the schema is strict). `visuals`, `sound`, `loreTag`, `revealCondition` and `castCondition` are optional.

## Where it goes

### Option 1: add it to an existing pack

Open a file in `src/content/spells/` (for example `core.json`) and add the object to its `"spells"` array.

### Option 2: a new pack

Create `src/content/spells/my_spells.json`:

```json
{
  "format": 2,
  "id": "spells.mine",
  "version": "1.0.0",
  "name": "My Spells",
  "spells": [ { "definition": { ... }, "balance": { ... } } ]
}
```

It loads automatically. See `CONTENT_SYSTEM.md` for `requires` and `overrides`.

### Making a class teach it

A lesson in `src/content/curriculum/` lists `revealOpportunities` with the spell's `id` (`"grants": "learned"` teaches it outright). The linter fails if the id does not exist.

## Checking

```
$ npm run lint:content
Content OK: 13 places, 7 characters, 16 spells.
```

A mistake looks like this:

```
Invalid game content (1 problem):
  - spells/my_spells.json:9:23: spells.0.definition.level: Invalid option: expected one of "unknown"|"novice"|...
```
