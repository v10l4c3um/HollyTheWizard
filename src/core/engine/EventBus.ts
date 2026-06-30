type Handler<T> = (payload: T) => void;

export class TypedBus<E extends Record<string, unknown>> {
	private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

	on<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
		(this.handlers[type] ??= []).push(handler);
	}

	off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
		const list = this.handlers[type];
		if (!list) return;
		this.handlers[type] = list.filter(h => h !== handler) as Handler<E[K]>[];
	}

	emit<K extends keyof E>(type: K, payload: E[K]): void {
		for (const h of this.handlers[type] ?? []) h(payload);
	}
}
