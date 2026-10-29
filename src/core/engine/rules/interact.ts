import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { TurnContext } from "./context";
import { done, refusal } from "./results";

type Interact = Extract<InWorldCommand, { type: "INTERACT" }>;

export function interact({ itemId, actionType }: Interact, ctx: TurnContext) {
	const item = ctx.state.inventory.items.find((i) => i.id === itemId);
	if (!item) return refusal(`You don't have an item with id "${itemId}".`);

	return done({
		briefOutput: `You ${actionType} ${item.name}. Something happened!`,
		events: [`${actionType} ${itemId}`],
		minutes: 10,
	});
}
