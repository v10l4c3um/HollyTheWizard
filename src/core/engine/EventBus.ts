import { Logger, silentLogger } from "../application/ports/Logger";

/** `void`, so any function fits; an async one is allowed but not awaited (see `TypedBus`). */
type Handler<T> = (payload: T) => void;

export interface SubscribeOptions {
	/** Higher runs first; equal priorities run in the order they subscribed. Default 0. */
	priority?: number;
}

/** The most events one outermost `emit` will deliver (including those raised by listeners). */
export const MAX_DELIVERIES_PER_EMIT = 100;

interface Subscription<T> {
	handler: Handler<T>;
	priority: number;
}

/**
 * A synchronous publish/subscribe channel for "something happened".
 *
 * - A listener that throws is logged and skipped; the emitter and the other
 *   listeners are not affected, so a faulty listener cannot undo a turn.
 * - An `emit` from inside a listener is queued and delivered once the current
 *   event has reached every listener (never in the middle of it). The
 *   outermost `emit` returns when the queue is empty, and delivers at most
 *   `MAX_DELIVERIES_PER_EMIT` events, so a listener that keeps re-emitting
 *   cannot loop forever.
 * - Listeners run in priority order (see `SubscribeOptions`).
 * - Delivery is synchronous on purpose: a turn is a transaction, and every
 *   listener has finished before it commits or rolls back. A listener may
 *   return a promise; it is not awaited, a rejection is only logged, and such
 *   a listener must not write game state.
 */
export class TypedBus<E extends Record<string, unknown>> {
	private subscriptions: { [K in keyof E]?: Subscription<E[K]>[] } = {};
	private queue: { type: keyof E; payload: E[keyof E] }[] = [];
	private delivering = false;

	constructor(private logger: Logger = silentLogger) {}

	/** Subscribes; returns a function that unsubscribes. */
	on<K extends keyof E>(
		type: K,
		handler: Handler<E[K]>,
		options: SubscribeOptions = {},
	): () => void {
		const priority = options.priority ?? 0;
		const list = (this.subscriptions[type] ??= []);
		// After the last one that runs first or at the same priority: stable.
		let at = list.length;
		while (at > 0 && list[at - 1].priority < priority) at--;
		list.splice(at, 0, { handler, priority });
		return () => this.off(type, handler);
	}

	off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
		const list = this.subscriptions[type];
		if (!list) return;
		this.subscriptions[type] = list.filter((s) => s.handler !== handler);
	}

	emit<K extends keyof E>(type: K, payload: E[K]): void {
		this.queue.push({ type, payload });
		if (this.delivering) return;

		this.delivering = true;
		try {
			let delivered = 0;
			for (let next = this.queue.shift(); next; next = this.queue.shift()) {
				if (delivered++ >= MAX_DELIVERIES_PER_EMIT) {
					this.logger.error(
						`[EventBus] More than ${MAX_DELIVERIES_PER_EMIT} events in one emit; dropping ${this.queue.length + 1} (last: ${String(next.type)}). A listener keeps emitting.`,
					);
					this.queue = [];
					break;
				}
				this.deliver(next.type, next.payload);
			}
		} finally {
			this.delivering = false;
		}
	}

	private deliver<K extends keyof E>(type: K, payload: E[K]): void {
		// A copy, so a listener that subscribes or unsubscribes does not change this delivery.
		for (const { handler } of [...(this.subscriptions[type] ?? [])]) {
			try {
				const result: unknown = handler(payload);
				if (result && typeof (result as Promise<unknown>).catch === "function") {
					(result as Promise<unknown>).catch((error) => this.logListenerError(type, error));
				}
			} catch (error) {
				this.logListenerError(type, error);
			}
		}
	}

	private logListenerError(type: keyof E, error: unknown): void {
		this.logger.error(`[EventBus] A listener of ${String(type)} failed`, error);
	}
}
