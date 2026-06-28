class WorldClock {
	// Minutes elapsed since start of day (0–1439)
	private minutesOfDay: number = 480; // default: 8:00 AM

	get timeOfDay(): string {
		const h = Math.floor(this.minutesOfDay / 60) % 24;
		if (h >= 5 && h < 12) return "morning";
		if (h >= 12 && h < 17) return "afternoon";
		if (h >= 17 && h < 21) return "evening";
		return "night";
	}

	advanceTime(minutes: number): void {
		this.minutesOfDay = (this.minutesOfDay + minutes) % 1440;
	}
}

export default WorldClock;
