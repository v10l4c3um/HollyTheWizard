import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { formatIssues } from "./ContentSchemas";

/**
 * Reads, parses and validates one content file. Adds a line to `problems`
 * for each thing wrong with it and returns `undefined`; never throws, so a
 * loader can gather the problems of every file before reporting.
 */
export function readContentFile<T>(
	filePath: string,
	schema: z.ZodType<T>,
	problems: string[],
): T | undefined {
	const label = path.basename(filePath);

	let text: string;
	try {
		text = fs.readFileSync(filePath, "utf-8");
	} catch {
		problems.push(`${label}: file not found or not readable (${filePath})`);
		return undefined;
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		problems.push(
			`${label}: not valid JSON (${error instanceof Error ? error.message : "parse error"})`,
		);
		return undefined;
	}

	const result = schema.safeParse(json);
	if (!result.success) {
		problems.push(...formatIssues(label, result.error));
		return undefined;
	}
	return result.data;
}
