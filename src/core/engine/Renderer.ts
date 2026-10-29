import { OllamaConfig } from "../../ai/OllamaConfig";
import {
	generateWithOllama,
	OLLAMA_RENDER_TIMEOUT_MS,
} from "../../ai/OllamaClient";
import { RenderContext } from "./RenderContext";

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

class Renderer {
	private config: OllamaConfig;

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	async render(ctx: RenderContext): Promise<string> {
		const prompt = this._buildPrompt(ctx);

		try {
			const responseText = await generateWithOllama(this.config, prompt, {
				context: "renderer",
				timeoutMs: OLLAMA_RENDER_TIMEOUT_MS,
			});
			return responseText.trim();
		} catch (error) {
			console.error(
				`[Renderer] Failed to render narrative: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
			// Narration is polish; the turn's outcome is not. Show the facts.
			return ctx.briefOutput;
		}
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
When: ${capitalize(ctx.weekday)} (day ${ctx.day}), ${ctx.timeOfDay}
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
