Add a Time System as a Core Resource
Every action produces a time cost event, even if small.
Define something like:

````ts

interface TimeState {
  currentBlock: number; // e.g. "morning block 2"
  blockLengthMinutes: number; // optional abstraction

}```

And every action returns:
``` ts
interface ActionResult {
  success: boolean;
  events: GameEvent[];
  timeCost: TimeCost;
}```

2. Define Time Costs as a Standard Output of ALL Actions
This is the most important shift.

```ts
type TimeCost =
  | { type: "free" }
  | { type: "partial"; amount: number } // e.g. 0.25 block
  | { type: "full" }
  | { type: "multiple"; blocks: number };
````

Now map your world actions:

Movement
local movement: free or partial (0.1–0.25)
zone travel: partial (0.5) or full

Interactions
talk to NPC: partial
explore area: partial
read/learn: full

Big actions
class / dungeon / quest step: full

Rest
sleep: multiple of 3.

Action Resolver Becomes the Authority
Your engine should decide time BEFORE narration.

Key idea:
👉 Failure still consumes time sometimes, but not always. 4. Time Advances World State (This is where structure emerges)

After resolving:
applyTime(result.timeCost);
advanceWorldEvents();

This is where your system becomes powerful.
Because now you can:
trigger class schedules
move NPCs
start events if player is late
lock content behind time windows
Example:
“You arrive too late. The lecture has already ended.”
This only works if time is real. 5. Narrator Should NEVER compute time
This is important given your current issue.
Your narrator prompt should NOT say:
“What just happened”
It should say:
“Translate these resolved facts into narrative”
And include:
Time advanced: +0.25 block (morning → late morning)
or even better:
Time result: partial advancement
But NOT reasoning—just output.

6.  Right now your system produces:
    “You cannot move there because it is not connected”
    LLM turns that into lore.
    With time system + structured events, you instead produce:
    {
    "event": "travel_failed",
    "reason": "not_connected",
    "timeCost": { "type": "partial", "amount": 0.1 }
    }
    Now narrator has no room to invent causality.
    It can only say:
    “You attempt to head toward the castle, but quickly realize there is no route leading there from the forest. A short amount of time passes as you reconsider your direction.”
    Notice:
    no magic explanation
    time still advances
    world feels alive
