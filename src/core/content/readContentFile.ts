import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
	Node,
	ParseError,
	findNodeAtLocation,
	parseTree,
	printParseErrorCode,
} from "jsonc-parser";
import { formatIssues } from "./ContentSchemas";

export interface Position {
	line: number;
	col: number;
}

/** Where in a content file a path leads (1-based), or the nearest place above it. */
export type Locate = (path: (string | number)[], keys?: string[]) => Position | undefined;

export interface ContentFile<T> {
	data: T;
	/** Label used in messages: the path relative to the content root. */
	label: string;
	locate: Locate;
}

function positionAt(text: string, offset: number): Position {
	let line = 1;
	let lastBreak = -1;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === "\n") {
			line++;
			lastBreak = i;
		}
	}
	return { line, col: offset - lastBreak };
}

function locator(tree: Node, text: string): Locate {
	return (segments, keys) => {
		// Walk up until a node exists: a missing key is reported where its object starts.
		for (let length = segments.length; length >= 0; length--) {
			const node = findNodeAtLocation(tree, segments.slice(0, length));
			if (!node) continue;
			if (length === segments.length && keys?.length && node.type === "object") {
				const property = node.children?.find(
					(child) => child.children?.[0]?.value === keys[0],
				);
				if (property?.children?.[0]) {
					return positionAt(text, property.children[0].offset);
				}
			}
			return positionAt(text, node.offset);
		}
		return undefined;
	};
}

/**
 * Reads, parses and validates one content file. Adds a line to `problems`
 * for each thing wrong with it (`file:line:col ...`) and returns `undefined`;
 * never throws, so a loader can gather the problems of every file before
 * reporting. `root` makes the file name in messages relative to the content
 * directory.
 */
export function readContentFileLocated<T>(
	filePath: string,
	schema: z.ZodType<T>,
	problems: string[],
	root?: string,
): ContentFile<T> | undefined {
	const label = root ? path.relative(root, filePath).split(path.sep).join("/") : path.basename(filePath);

	let text: string;
	try {
		text = fs.readFileSync(filePath, "utf-8");
	} catch {
		problems.push(`${label}: file not found or not readable (${filePath})`);
		return undefined;
	}

	const syntaxErrors: ParseError[] = [];
	const tree = parseTree(text, syntaxErrors, {
		disallowComments: true,
		allowTrailingComma: false,
	});
	if (syntaxErrors.length > 0 || !tree) {
		if (syntaxErrors.length === 0) problems.push(`${label}: not valid JSON (empty file)`);
		for (const error of syntaxErrors) {
			const { line, col } = positionAt(text, error.offset);
			problems.push(`${label}:${line}:${col}: not valid JSON (${printParseErrorCode(error.error)})`);
		}
		return undefined;
	}

	const locate = locator(tree, text);
	const result = schema.safeParse(JSON.parse(text));
	if (!result.success) {
		problems.push(...formatIssues(label, result.error, locate));
		return undefined;
	}
	return { data: result.data, label, locate };
}

/** `readContentFileLocated` for callers that only want the data. */
export function readContentFile<T>(
	filePath: string,
	schema: z.ZodType<T>,
	problems: string[],
): T | undefined {
	return readContentFileLocated(filePath, schema, problems)?.data;
}
