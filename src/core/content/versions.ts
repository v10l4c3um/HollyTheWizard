/** `x.y.z` as numbers. Content versions are plain three-part versions. */
export function parseVersion(version: string): [number, number, number] {
	const [major, minor, patch] = version.split(".").map(Number);
	return [major, minor, patch];
}

/** True if `actual` can stand in for `wanted`: same major, and not older. */
export function satisfies(actual: string, wanted: string): boolean {
	const [aMajor, aMinor, aPatch] = parseVersion(actual);
	const [wMajor, wMinor, wPatch] = parseVersion(wanted);
	if (aMajor !== wMajor) return false;
	if (aMinor !== wMinor) return aMinor > wMinor;
	return aPatch >= wPatch;
}
