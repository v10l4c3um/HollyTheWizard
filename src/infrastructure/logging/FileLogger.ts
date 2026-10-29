import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../core/application/ports/Logger";

/** Appends one line per entry to a log file; never throws. */
export class FileLogger implements Logger {
	constructor(private filePath: string = path.join("logs", "game.log")) {}

	error(message: string, cause?: unknown): void {
		const detail =
			cause instanceof Error
				? (cause.stack ?? cause.message)
				: cause === undefined
					? ""
					: String(cause);
		const line = `${new Date().toISOString()} ERROR ${message}${detail ? `\n${detail}` : ""}\n`;
		try {
			fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
			fs.appendFileSync(this.filePath, line);
		} catch {
			// Logging must never break a turn.
		}
	}
}
