import * as readline from "readline";

interface GameResult {
	success: boolean;
	output: string;
	newState?: unknown;
}

interface GameEngine {
	handleCommand(input: string): Promise<GameResult>;
}

class CliApp {
	private rl: readline.Interface;
	private engine: GameEngine;
	private running: boolean = false;

	constructor(engine: GameEngine) {
		this.engine = engine;
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
	}

	private printSeparator(): void {
		console.log("\n" + "=".repeat(60) + "\n");
	}

	private async handleInput(input: string): Promise<void> {
		const trimmed = input.trim();

		if (!trimmed) {
			return;
		}

		if (
			trimmed.toLowerCase() === "quit" ||
			trimmed.toLowerCase() === "exit"
		) {
			this.running = false;
			console.log("\nThanks for playing!");
			return;
		}

		try {
			const result = await this.engine.handleCommand(trimmed);
			this.printSeparator();
			console.log(result.output);
		} catch (error) {
			this.printSeparator();
			console.log(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async start(): Promise<void> {
		this.running = true;
		console.log("=".repeat(60));
		console.log("Welcome to Holly the Wizard");
		console.log("=".repeat(60));
		this.printSeparator();

		const prompt = (): void => {
			if (!this.running) {
				this.rl.close();
				return;
			}

			this.rl.question("> ", async (input: string) => {
				await this.handleInput(input);
				prompt();
			});
		};

		prompt();
	}

	public close(): void {
		this.running = false;
		this.rl.close();
	}
}

export { CliApp, GameEngine, GameResult };
