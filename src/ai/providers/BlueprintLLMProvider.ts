import { z } from "zod";
import { OllamaConfig } from "../../core/engine/OllamaConfig";
import { generateWithOllama } from "../../core/engine/OllamaClient";

type GenerateAttempt<T> =
	| { ok: true; value: T }
	| { ok: false; rawText: string; errors: string[] };

/**
 * Minimal, standalone LLM JSON-generation helper for the blueprint
 * pipeline. Deliberately NOT a refactor of Resolver.ts/Renderer.ts (which
 * keep their existing direct-fetch style) - this is a new, narrowly
 * scoped abstraction that adds what neither of them has: Zod validation,
 * a single repair pass, and a `null` (not throw) result on failure so
 * callers can fall back to a deterministic blueprint.
 */
export class BlueprintLLMProvider {
	constructor(private config: OllamaConfig) {}

	async generateJson<T>(
		prompt: string,
		schema: z.ZodType<T>,
	): Promise<T | null> {
		const first = await this._tryGenerate(prompt, schema);
		if (first.ok) {
			return first.value;
		}

		const repairPrompt = this._buildRepairPrompt(
			prompt,
			first.rawText,
			first.errors,
		);
		const repaired = await this._tryGenerate(repairPrompt, schema);
		if (repaired.ok) {
			return repaired.value;
		}

		console.debug(
			`[BlueprintLLMProvider] Generation failed after repair pass: ${repaired.errors.join("; ")}`,
		);
		return null;
	}

	private async _tryGenerate<T>(
		prompt: string,
		schema: z.ZodType<T>,
	): Promise<GenerateAttempt<T>> {
		try {
			const responseText = await generateWithOllama(this.config, prompt, {
				context: "blueprint generation",
				format: "json",
			});

			let parsed: unknown;
			try {
				parsed = JSON.parse(responseText);
			} catch {
				return {
					ok: false,
					rawText: responseText,
					errors: ["Response was not valid JSON."],
				};
			}

			const result = schema.safeParse(parsed);
			if (result.success) {
				return { ok: true, value: result.data };
			}

			return {
				ok: false,
				rawText: responseText,
				errors: result.error.issues.map(
					(issue) => `${issue.path.join(".")}: ${issue.message}`,
				),
			};
		} catch (error) {
			return {
				ok: false,
				rawText: "",
				errors: [
					error instanceof Error ? error.message : "Unknown error",
				],
			};
		}
	}

	private _buildRepairPrompt(
		originalPrompt: string,
		rawText: string,
		errors: string[],
	): string {
		return `${originalPrompt}

Your previous response was invalid. Raw response:
${rawText}

Validation errors:
${errors.map((e) => `- ${e}`).join("\n")}

Please respond again with ONLY corrected JSON that fixes these errors.`;
	}
}
