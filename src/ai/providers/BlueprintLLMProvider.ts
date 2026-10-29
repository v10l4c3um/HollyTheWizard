import { z } from "zod";
import { OllamaConfig } from "../OllamaConfig";
import {
	generateWithOllama,
	OLLAMA_BLUEPRINT_TIMEOUT_MS,
} from "../OllamaClient";
import { Logger, silentLogger } from "../../core/application/ports/Logger";

type GenerateAttempt<T> =
	| { ok: true; value: T }
	| {
			ok: false;
			rawText: string;
			errors: string[];
			/** The request itself failed, so there is no reply to repair. */
			requestFailed?: boolean;
	  };

/**
 * Minimal, standalone LLM JSON-generation helper for the blueprint
 * pipeline. Deliberately NOT a refactor of Resolver.ts/Renderer.ts (which
 * keep their existing direct-fetch style) - this is a new, narrowly
 * scoped abstraction that adds what neither of them has: Zod validation,
 * a single repair pass, and a `null` (not throw) result on failure so
 * callers can fall back to a deterministic blueprint.
 */
export class BlueprintLLMProvider {
	constructor(
		private config: OllamaConfig,
		private logger: Logger = silentLogger,
	) {}

	async generateJson<T>(
		prompt: string,
		schema: z.ZodType<T>,
		/** Extra checks on a structurally valid reply; returns error messages. */
		validate?: (value: T) => string[],
	): Promise<T | null> {
		const first = await this._tryGenerate(prompt, schema, validate);
		if (first.ok) {
			return first.value;
		}
		if (first.requestFailed) {
			this.logger.debug(
				`[BlueprintLLMProvider] Request failed, not repairing: ${first.errors.join("; ")}`,
			);
			return null;
		}

		const repairPrompt = this._buildRepairPrompt(
			prompt,
			first.rawText,
			first.errors,
		);
		const repaired = await this._tryGenerate(repairPrompt, schema, validate);
		if (repaired.ok) {
			return repaired.value;
		}

		this.logger.debug(
			`[BlueprintLLMProvider] Generation failed after repair pass: ${repaired.errors.join("; ")}`,
		);
		return null;
	}

	private async _tryGenerate<T>(
		prompt: string,
		schema: z.ZodType<T>,
		validate?: (value: T) => string[],
	): Promise<GenerateAttempt<T>> {
		try {
			const responseText = await generateWithOllama(this.config, prompt, {
				context: "blueprint generation",
				// The reply is constrained to the schema, so it cannot invent keys or
				// ids the schema does not allow. Plain JSON mode is only the fallback
				// for a schema that cannot be expressed as JSON Schema.
				format: jsonSchemaFor(schema),
				timeoutMs: OLLAMA_BLUEPRINT_TIMEOUT_MS,
				logger: this.logger,
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
				const problems = validate?.(result.data) ?? [];
				if (problems.length === 0) {
					return { ok: true, value: result.data };
				}
				return { ok: false, rawText: responseText, errors: problems };
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
				requestFailed: true,
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

function jsonSchemaFor(schema: z.ZodType): object | "json" {
	try {
		return z.toJSONSchema(schema) as object;
	} catch {
		return "json";
	}
}
