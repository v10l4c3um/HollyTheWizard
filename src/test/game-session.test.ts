import GameState from "../core/domain/world/GameState";
import { GameSession, HISTORY_LIMIT } from "../core/engine/GameSession";

const stateAt = (location: string) => {
	const s = new GameState();
	s.currentLocationId = location;
	return s;
};

describe("GameSession turns", () => {
	it("works on a copy during a turn and keeps it on commit", () => {
		const initial = stateAt("great_hall");
		const session = new GameSession(initial);

		session.begin();
		expect(session.state).not.toBe(initial);
		session.state.currentLocationId = "hallway";
		session.commit();

		expect(session.state.currentLocationId).toBe("hallway");
		expect(initial.currentLocationId).toBe("great_hall"); // the snapshot is untouched
		expect(session.canUndo).toBe(true);
	});

	it("rollback makes the untouched state live again", () => {
		const initial = stateAt("great_hall");
		const session = new GameSession(initial);

		session.begin();
		session.state.currentLocationId = "forest";
		session.state.worldClock.advanceTime(300);
		session.rollback();

		expect(session.state).toBe(initial);
		expect(initial.currentLocationId).toBe("great_hall");
		expect(session.canUndo).toBe(false);
		expect(session.inTurn).toBe(false);
	});

	it("will not open a second turn or commit without one", () => {
		const session = new GameSession(new GameState());
		expect(() => session.commit()).toThrow();
		session.begin();
		expect(() => session.begin()).toThrow();
	});

	it("undo goes back one committed turn at a time, then runs out", () => {
		const session = new GameSession(stateAt("a"));
		for (const place of ["b", "c"]) {
			session.begin();
			session.state.currentLocationId = place;
			session.commit();
		}

		session.begin();
		expect(session.undo()).toBe(true);
		session.commit();
		expect(session.state.currentLocationId).toBe("b");

		session.begin();
		expect(session.undo()).toBe(true);
		session.commit();
		expect(session.state.currentLocationId).toBe("a");

		session.begin();
		expect(session.undo()).toBe(false);
		session.rollback();
		expect(session.state.currentLocationId).toBe("a");
	});

	it("replace (a load) forgets the history", () => {
		const session = new GameSession(stateAt("a"));
		session.begin();
		session.state.currentLocationId = "b";
		session.commit();
		expect(session.canUndo).toBe(true);

		const loaded = stateAt("saved");
		session.begin();
		session.replace(loaded);
		session.commit();

		expect(session.state).toBe(loaded);
		expect(session.canUndo).toBe(false);
	});

	it("keeps only the most recent turns", () => {
		const session = new GameSession(stateAt("start"));
		for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
			session.begin();
			session.state.currentLocationId = `p${i}`;
			session.commit();
		}
		let steps = 0;
		for (;;) {
			session.begin();
			const ok = session.undo();
			if (ok) session.commit();
			else {
				session.rollback();
				break;
			}
			steps++;
		}
		expect(steps).toBe(HISTORY_LIMIT);
		expect(session.state.currentLocationId).toBe("p5");
	});
});
