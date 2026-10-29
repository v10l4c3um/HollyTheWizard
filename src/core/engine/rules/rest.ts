import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { TurnContext } from "./context";
import { done } from "./results";

type Rest = Extract<InWorldCommand, { type: "REST" }>;

export function rest({ duration, locationId }: Rest, ctx: TurnContext) {
	const where = locationId ?? ctx.state.currentLocationId;
	const name = ctx.registry.getLocation(where)?.displayName ?? where;

	return done({
		fact: { kind: "rested", hours: duration, place: { id: where, name } },
		minutes: 60 * duration,
	});
}
