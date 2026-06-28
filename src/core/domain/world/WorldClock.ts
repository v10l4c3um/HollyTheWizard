class WorldClock {
	currentTime: number;

	constructor() {
		this.currentTime = 0;
	}

	advanceTime(minutes: number): void {
		this.currentTime += minutes;
	}

	getTime(): number {
		return this.currentTime;
	}
}

export default WorldClock;