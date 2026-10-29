import * as fs from "fs";
import * as path from "path";
import { InvalidSaveError } from "../../core/application/ports/InvalidSaveError";
import { Logger } from "../../core/application/ports/Logger";

type Level = "debug" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, warn: 1, error: 2 };

/** Appends one entry per call to a log file; never throws. */
export class FileLogger implements Logger {
	constructor(
		private filePath: string = path.join("logs", "game.log"),
		/** Entries below this level are not written. */
		private minLevel: Level = "debug",
	) {}

	debug(message: string, detail?: unknown): void {
		this.write("debug", message, detail);
	}

	warn(message: string, detail?: unknown): void {
		this.write("warn", message, detail);
	}

	error(message: string, detail?: unknown): void {
		this.write("error", message, detail);
	}

	private write(level: Level, message: string, detail: unknown): void {
		if (ORDER[level] < ORDER[this.minLevel]) return;
		const text = describe(detail);
		const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${text ? `\n${text}` : ""}\n`;
		try {
			fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
			fs.appendFileSync(this.filePath, line);
		} catch {
			// Logging must never break a turn.
		}
	}
}

function describe(detail: unknown): string {
	if (detail === undefined) return "";
	if (detail instanceof InvalidSaveError) {
		return `${detail.stack ?? detail.message}\n  - ${detail.problems.join("\n  - ")}`;
	}
	if (detail instanceof Error) return detail.stack ?? detail.message;
	if (typeof detail === "string") return detail;
	try {
		return JSON.stringify(detail, null, 2);
	} catch {
		return String(detail);
	}
}
