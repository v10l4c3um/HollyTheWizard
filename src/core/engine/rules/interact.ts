import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { TurnContext } from "./context";
import { done, refusal } from "./results";

type Interact = Extract<InWorldCommand, { type: "INTERACT" }>;

export function interact({ itemId, actionType }: Interact, ctx: TurnContext) {
	const item = ctx.state.inventory.items.find((i) => i.id === itemId);
	if (!item) return refusal({ reason: "no-item", input: itemId });

	return done({
		fact: { kind: "interacted", item: { id: itemId, name: item.name }, verb: actionType },
		minutes: 10,
	});
}
