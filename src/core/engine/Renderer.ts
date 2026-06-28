import { OllamaConfig } from "./OllamaConfig";
import { RenderContext } from "./RenderContext";

class Renderer {
	private config: OllamaConfig;

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	async render(ctx: RenderContext): Promise<string> {
		const prompt = this._buildPrompt(ctx);

		const response = await fetch(this.config.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.config.model,
				prompt,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Renderer request failed: ${response.statusText}`);
		}

		const data = (await response.json()) as { response: string };
		return data.response.trim();
	}

	private _buildPrompt(ctx: RenderContext): string {
		const npcs =
			ctx.nearbyNPCNames.length > 0
				? `Nearby: ${ctx.nearbyNPCNames.join(", ")}.`
				: "No one else is nearby.";

		const recentEvents =
			ctx.recentEvents.length > 0
				? `Recent events: ${ctx.recentEvents.slice(-3).join("; ")}.`
				: "";

		const timeInfo = ctx.timePassed
			? `Time passed: ${ctx.timePassed.minutes} minutes (${ctx.timePassed.beforeTimeOfDay} → ${ctx.timePassed.afterTimeOfDay}). Mention this naturally if relevant.`
			: "";

		return `You are a narrator for a fantasy RPG.

Write a single immersive paragraph (3-5 sentences) in second person.

IMPORTANT STYLE RULES:

- You are ONLY translating game events into narrative.
- You must NOT invent causes, magic, lore, or physical obstacles that are not explicitly given.
- If something is not possible, express it as lack of access or inability, not as an in-world force or story event.
- Keep failure states neutral, grounded, and slightly literary (book-like tone is fine, but no new fiction causes).

Character: ${ctx.playerName}
Location: ${ctx.locationName} — ${ctx.locationDescription}
Time of day: ${ctx.timeOfDay}
${npcs}
${recentEvents}
${timeInfo}
Narration style: ${ctx.narrationMode}

What just happened (brief): ${ctx.briefOutput}

Write only the narrative paragraph. No preamble, no meta-commentary.
`;
	}
}

export default Renderer;
