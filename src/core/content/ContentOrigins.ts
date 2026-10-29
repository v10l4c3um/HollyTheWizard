export interface ContentOrigin {
	/** File relative to the content root. */
	file: string;
	line: number;
	col: number;
}

/**
 * Where each piece of content came from, so a problem found later (by the
 * linter) can say "npcs/npcs.json:14:7". Built by the loader; the registry
 * itself knows nothing about files.
 */
export class ContentOrigins {
	private origins = new Map<string, ContentOrigin>();

	set(kind: string, id: string, origin: ContentOrigin): void {
		this.origins.set(`${kind}:${id}`, origin);
	}

	get(kind: string, id: string): ContentOrigin | undefined {
		return this.origins.get(`${kind}:${id}`);
	}

	/** `file:line:col`, or an empty string when unknown. */
	where(kind: string, id: string): string {
		const origin = this.get(kind, id);
		return origin ? `${origin.file}:${origin.line}:${origin.col}` : "";
	}
}
