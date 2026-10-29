# Curriculum & Academics

Files: `src/core/domain/quest/Curriculum.ts` (types, 151 lines), `CurriculumService.ts` (86), `Exam.ts` (13, unused), `src/core/content/SchoolDataLoader.ts`, content in `src/content/curriculum/` (`subjects.json`, `timetables.json`, `year1-charms.json`, `year1-defense.json`, `year1-potions.json`), `academicState` in `GameState`. Commands: `STUDY`, `ATTEND_CLASS` in `TurnResolver`. No dedicated tests.

## What it does

Is meant to be the academic backbone of the game: subjects, a lesson sequence per subject per year, a weekly timetable, per-subject progress (knowledge, lesson pointer, attended/skipped), and exams. Lessons give rewards (attribute points, subject knowledge) and are the main source of spell reveals.

## How it works

- **Types:** 27 `SubjectType`s, `SchoolYear` 1 to 7, `SubjectCurriculum` (subject + year + ordered `LessonDefinition[]`), `WeeklyTimetable` (21 slots: day x morning/afternoon/evening, each `class | free | curfew`), `PlayerAcademicState` (attributes + per-subject `SubjectProgress`).
- **Lessons** carry an `order`, `title`, `topic`, an `importance` tag, `rewards`, and optional `revealOpportunities` (spell id, chance, requirements).
- **`ATTEND_CLASS`:** `CurriculumService.getCurrentLesson` finds the lesson in the subject's current year whose `order` equals `currentLessonOrder`. The resolver applies the rewards as effects, rolls the spell reveals, then a `LessonAdvanced` effect appends the lesson id to `attendedLessons` and increments the pointer.
- **`STUDY`:** adds `10 * hours` knowledge to a subject, with no lesson involved.
- **Content shipped:** 11 lessons in total (charms 5, defense 3, potions 3), all year 1. `subjects.json` defines 5 subjects (charms, potions, defense, transfiguration, herbology), though the type allows 27.

## Strengths

- **Good data shape.** Lessons, rewards, requirements and reveal opportunities are expressive and fully data-driven, and a curriculum file per subject and year scales naturally.
- **Linear lesson order with a pointer** is simple, predictable and saveable.
- **Requirements are a typed union** (`attribute`, `subjectKnowledge`, `year`, `spellKnown`), which is a good seed for a general condition system.
- **Timetable modeled as slots** with a `curfew` type is an elegant idea for structuring days.
- **Lessons link to spells and story:** importance tags (`routine`, `important`, `exam`, `story`) hint at a plan for pacing.
- **Rewards go through effects** in `ATTEND_CLASS`, so lesson outcomes are auditable.

## Weaknesses

1. **Fixed:** the timetable is read. `ATTEND_CLASS` only works in the timetabled period of the current weekday, in the class's `location`, once per slot (recorded as the flag `attended.<subject>.<day>.<period>`). Original description: **The timetable is dead data.** `timetables.json` is loaded into `SchoolData`, and nothing reads it. A class can be attended any time, anywhere, in any order, with no check against day, period, location or teacher. There is no calendar either: `GameCalendar` exists as a type, while `WorldClock` has day and time of day, but nothing connects them to a week, term, or class schedule. The school structure that the game's setting depends on does not exist in the rules.
2. **Years do not advance academically.** `AdvanceYear` updates the blueprint and `currentYear`, and (from what I read) never touches `academicState`. A subject's `year` stays 1 and its `currentLessonOrder` keeps its old value, so a year-2 player would still look up year-1 curriculum, find no lesson, and get "No more lessons available". Also, the `year` requirement reads the first subject's year as the player's year, instead of `state.currentYear`.
3. **The curriculum is almost empty.** 11 lessons exist. Charms runs out after 5 attended lessons (five in-game hours), then `ATTEND_CLASS charms` answers "No more lessons available". Transfiguration and herbology are in the timetable and subject list with no lessons at all. There is no way to run out of content gracefully, and no content for years 2 to 7.
4. **A school year has no pacing.** Lessons advance on demand, one per hour, with no weekly cadence, term dates, attendance consequences or progression gates. The player can finish a year's charms in an afternoon.
5. **Skipping and absence do not exist.** `skippedLessons` and `LessonSkipped` are defined and never used. There is no penalty or story for missing class, no tardiness, and no teacher reaction.
6. **No exams or assessment.** `Exam.ts` is an unused stub (it holds an `AttributeStats` and a description), `importance: "exam"` is never read, and nothing computes grades or consequences. The year ends only when the player types "advance year".
7. **Knowledge is a bare number.** `STUDY` gives `+10 * hours` with no cap, no diminishing returns, no energy cost, and no link to lessons. Knowledge has no meaning except as a threshold for reveals, and study is strictly worse than attending class, so it is a "press for number" action. `STUDY` also accepts any subject id string, including ones with no curriculum.
8. **Two competing implementations of lesson rewards.** `CurriculumService.applyLessonRewards` (unused, writes `academicState.attributes`) duplicates the logic in `TurnResolver._attendClass` (uses effects, writes `player.attributes`). This is the source of the duplicated attribute stores (see 10), and `addSubjectKnowledge` is a third unused path.
9. **Hard-coded and duplicated lists.** The 27 subjects exist in `SubjectType`, in the `GameState` constructor loop, and (5 of them) in `subjects.json`. Adding a subject touches code in three places.
10. **Partly fixed:** class slots now have a `location`, and students and teacher NPCs follow the timetable via their schedule. Original description: **No teachers, classmates or places.** Lessons have no instructor NPC, location, or participants, so classes cannot produce social scenes, rivalries or discoveries, which are the natural payoff of a school setting. Lesson text is shown but gameplay in class is a single button press.
11. **Loader fragility.** Curriculum files are discovered by the `year*` filename prefix and cast to a type without validation; a bad lesson order (duplicate or gap) silently stalls a subject because lookup requires an exact `order` match.
12. **Testing.** No tests for lesson lookup, year change, run-out, or loading.

## Rework ideas

- **Make time structural.** Build a real calendar (year, term, week, day, period) on top of `WorldClock`, and use the timetable to say what is happening now. Classes happen at a place and time, with a teacher present.
- **Drive attendance from the schedule.** `ATTEND_CLASS` becomes "go to the class that is on now", with outcomes for late or absent, and consequences (knowledge, a teacher's opinion, reputation).
- **Fix year transition:** reset or advance each subject's `year`/`currentLessonOrder` in `AdvanceYear`, and derive "current year" from `state.currentYear`. Gate advancement on exam results.
- **Add exams and grades** as scheduled events (using `importance: "exam"`): a test of knowledge, attributes and spell proficiency, with a rule-based result, narrated by the renderer, and effects on relationships and the story.
- **Pace content to the calendar:** one or two lessons per subject per week rather than on-demand, so a year contains a believable number of lessons and gaps for free time and relationships.
- **Make study meaningful:** a capped, energy-costing activity with diminishing returns, targeted at an upcoming exam or a specific lesson topic, perhaps with a study partner (an NPC scene).
- **One reward path:** delete `CurriculumService.applyLessonRewards` and `addSubjectKnowledge`, route through effects only.
- **Single subject source:** derive the subject list from content (`subjects.json`), validate with Zod, and lint cross-references (lessons to spells, timetable to subjects, lesson order continuity).
- **Add instructors and rooms** to the content model (teacher NPC id, location id per subject), so classes become scenes.
- **Plan the content budget:** a school year needs a few dozen lessons per core subject. Consider generated-but-validated lesson variations, or reduce the scope (fewer subjects, weekly "lesson beats").

## Open questions

- Is the game calendar-driven (a fixed school week and term, the player chooses how to spend free periods) or open-ended (the player does what they like when they like)? The calendar-driven model fits the setting and makes pacing, exams and NPC schedules coherent.
- How many subjects and years are truly in scope? A slice of 4 core subjects and one year may be right.
- Should lessons be passive (press attend) or interactive (a short scene with choices, a spell demonstration, a question from the teacher)?
- Are exams pass/fail gates or just flavored milestones?

## Attending a class (as enforced today)

`TurnResolver._attendClass` refuses, with no time cost, unless all three hold: the year's timetable has that subject in the current weekday and period (`There is no <Subject> class right now.`; never at night), the player is in the slot's location (`The <Subject> class is held in <Room>.`), and the slot has not been attended (`You have already attended ...`). A missed class simply means the lesson waits for the next slot (charms: Monday and Thursday mornings).
