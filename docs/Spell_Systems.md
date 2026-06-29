# Hogwarts RPG Gameplay Systems

## High-level Gameplay Loop

The player lives through a Hogwarts school year.

Every day consists of scheduled classes and free time.

``` text
Attend / Skip classes
        ↓
Gain knowledge & attributes
        ↓
Practice spells
        ↓
Explore / Socialize / Study
        ↓
Exams
        ↓
Next term
```

## Curriculum

The curriculum defines **what is taught**.

It is static and shared by every player.

``` text
Year 1
    Charms
        Lesson 1
        Lesson 2
        Lesson 3

    Potions
        Lesson 1
        Lesson 2
```

Lessons introduce topics, spell opportunities, practical exercises and
exams.

## Timetable

The timetable defines **when classes occur**.

``` text
Monday

Morning     Charms
Afternoon   Herbology
Evening     Free
```

The timetable stores **subjects**, not lessons.

## Lesson Resolution

When a class starts:

1.  Determine the player's current lesson for that subject.
2.  Load the matching lesson from the curriculum.
3.  Resolve attendance.

Possible outcomes:

-   Routine lesson
-   Spell demonstration
-   Quiz
-   Student event
-   Story event
-   Practical exercise

## Subject Progression

Each subject progresses independently.

``` text
Defense
Lesson 7
Knowledge 42

Charms
Lesson 12
Knowledge 58
```

Skipping lessons slows progress but never permanently blocks it.

## Attributes

General character statistics:

-   Intellect
-   Wisdom
-   Willpower
-   Dexterity
-   Charisma

Primarily improved through:

-   Classes
-   Study
-   Homework
-   Exams

Attributes gate advanced content but do not directly teach spells.

## Subject Knowledge

Every subject has a knowledge value.

``` text
Defense 42
Charms 61
Potions 33
```

Knowledge represents academic understanding and determines eligibility
for more advanced curriculum and spell opportunities.

## Spell Progression

Each spell moves through four states.

``` text
Hidden
↓
Available
↓
Learned
↓
Mastered
```

-   **Hidden** -- Prerequisites not met.
-   **Available** -- Player is academically ready but hasn't discovered
    the spell.
-   **Learned** -- Spell has been discovered through some source.
-   **Mastered** -- High proficiency through practice.

## Spell Discovery

The curriculum decides **when** a spell becomes available.

The player decides **how** it is learned.

Possible discovery sources:

-   Lesson
-   Library
-   Friend
-   Professor
-   Dueling club
-   Exploration
-   Story event

Skipping a lesson removes the easiest learning opportunity but does not
permanently lock the spell.

## Practice

Practice improves:

-   Spell mastery
-   Reliability

Practice is the primary way to become better at casting.

## Study

Study improves:

-   Subject knowledge
-   Attributes
-   Exam readiness

Study prepares the student to learn new spells but does not
significantly improve spell mastery.

## Spell Usage

Using spells during gameplay grants only small mastery gains, rewarding
natural play while discouraging grinding.

## Exploration

Exploration competes with academics.

Benefits:

-   Discoveries
-   Quests
-   Relationships
-   Alternative spell sources

Costs:

-   Less study
-   Lower knowledge
-   Harder exams

## Exams

Each term ends with exams.

Performance depends on:

-   Attendance
-   Subject knowledge
-   Attributes
-   Spell mastery
-   Homework

Rewards include:

-   Professor trust
-   Advanced curriculum
-   New opportunities
-   House points
-   Story branches

## Data Architecture

### Static Data

-   Subjects
-   Curriculum
-   Lessons
-   Timetable
-   Spell definitions

### Dynamic Player State

-   Attributes
-   Subject progress
-   Spell states
-   Relationships
-   Exam results

The resolver combines static data with player state whenever an activity
is performed.

## Design Philosophy

Each system has a single responsibility:

-   **Curriculum** decides what students are expected to learn.
-   **Timetable** decides when subjects are taught.
-   **Classes** provide knowledge, attributes, and learning
    opportunities.
-   **Study** builds academic readiness.
-   **Practice** builds spell mastery.
-   **Exploration** offers alternative progression at the cost of
    academic progress.
-   **Exams** validate the player's long-term choices and create
    meaningful pressure.
