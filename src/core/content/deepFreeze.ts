/**
 * Freezes a value and everything reachable through its own properties (plain
 * objects, arrays and class instances), so content handed out by the registry
 * cannot be changed by accident. Maps and Sets are not used in content and are
 * not frozen (Object.freeze would not stop `set`/`add` on them anyway).
 */
export function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze((value as Record<PropertyKey, unknown>)[key]);
	}
	return value;
}
