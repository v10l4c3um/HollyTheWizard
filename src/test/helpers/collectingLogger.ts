import { Logger } from "../../core/application/ports/Logger";

type Level = "debug" | "warn" | "error";

/** A logger that remembers what it was given, for tests that check what was logged. */
export function collectingLogger() {
	const entries: { level: Level; message: string; detail?: unknown }[] = [];
	const logger: Logger & { entries: typeof entries; at(level: Level): string[] } = {
		entries,
		debug: (message, detail) => void entries.push({ level: "debug", message, detail }),
		warn: (message, detail) => void entries.push({ level: "warn", message, detail }),
		error: (message, detail) => void entries.push({ level: "error", message, detail }),
		at: (level) => entries.filter((e) => e.level === level).map((e) => e.message),
	};
	return logger;
}
