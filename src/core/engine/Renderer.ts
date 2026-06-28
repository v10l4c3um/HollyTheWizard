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

		const data = await response.json();
		return (data.response as string).trim();
	}

	private _buildPrompt(ctx: RenderContext): string {
		const npcs = ctx.nearbyNPCNames.length > 0
			? `Nearby: ${ctx.nearbyNPCNames.join(", ")}.`
			: "No one else is nearby.";

		const recentEvents = ctx.recentEvents.length > 0
			? `Recent events: ${ctx.recentEvents.slice(-3).join("; ")}.`
			: "";

		return `You are a narrator for a fantasy RPG. Write a single immersive paragraph (2-4 sentences) describing what just happened, in second person.

Character: ${ctx.playerName}
Location: ${ctx.locationName} — ${ctx.locationDescription}
Time of day: ${ctx.timeOfDay}
${npcs}
${recentEvents}
Narration style: ${ctx.narrationMode}

What just happened (brief): ${ctx.briefOutput}

Write only the narrative paragraph. No preamble, no meta-commentary.`;
	}
}

export default Renderer;
