# CLI RPG Rough Pseudocode

This file outlines a rough high-level flow of how the game is expected to operate. It is intentionally architectural rather than implementation-complete.

## 1. Bootstrap

```text
main():
  config = loadConfig()
  logger = createLogger(config)
  contentRegistry = loadContentPacks(config.contentPaths)
  validateContent(contentRegistry)

  repository = createGameRepository(config.persistence)
  rng = createRandomProvider(config.seed)
  clock = createClockProvider()
  narrationProvider = createNarrationProvider(config.ai)

  eventBus = createEventBus()
  scheduler = createScheduler(contentRegistry, eventBus)
  ruleEngine = createRuleEngine(contentRegistry, eventBus)
  effectProcessor = createEffectProcessor(eventBus)
  narrationService = createNarrationService(narrationProvider, contentRegistry)

  engine = createGameEngine({
    repository,
    rng,
    clock,
    scheduler,
    ruleEngine,
    effectProcessor,
    narrationService,
    eventBus,
    contentRegistry,
    logger
  })

  cli = createCliApp(engine)
  cli.run()
```

## 2. New game flow

```text
startNewGame(input):
  playerProfile = buildPlayerProfile(input)
  starterState = createInitialGameState(playerProfile, contentRegistry)

  assignStartingLocation(starterState)
  initializeStarterQuests(starterState)
  initializeNpcSchedules(starterState)
  initializePlotArcs(starterState)
  initializeFlags(starterState)

  repository.save(starterState)

  introContext = buildSceneContext(starterState, reason = "game_start")
  introText = narrationService.generateIntro(introContext)

  return {
    state: starterState,
    narration: introText
  }
```

## 3. Main game loop

```text
gameLoop(state):
  while state.session.isRunning:
    renderCurrentSceneSummary(state)
    renderAvailableCommands(state)

    rawInput = cli.readInput()

    if rawInput is HELP:
      renderHelp()
      continue

    if rawInput is SAVE:
      repository.save(state)
      render("Game saved.")
      continue

    if rawInput is LOAD:
      state = repository.load(selectedSlot)
      render("Game loaded.")
      continue

    parsedCommand = commandParser.parse(rawInput)

    if parsedCommand invalid:
      render("I don't understand that command.")
      continue

    result = engine.performAction(state, parsedCommand)
    state = result.state

    renderNarration(result.narration)
    renderConsequences(result.summary)

  render("Session ended.")
```

## 4. Perform action flow

```text
performAction(state, action):
  validation = actionValidator.validate(state, action)
  if validation fails:
    return actionFailure(state, validation.message)

  preEvents = []
  postEvents = []

  resolutionContext = {
    state,
    action,
    rng,
    contentRegistry
  }

  outcome = turnResolver.resolve(resolutionContext)

  nextState = applyOutcome(state, outcome.stateChanges)
  preEvents += outcome.events

  nextState = scheduler.advanceTimeIfNeeded(nextState, action)
  schedulerEvents = scheduler.process(nextState)
  nextState = applyEvents(nextState, schedulerEvents)
  postEvents += schedulerEvents

  triggeredEffects = effectProcessor.run(nextState, preEvents + postEvents)
  nextState = applyEffects(nextState, triggeredEffects)

  arcUpdates = plotArcCoordinator.update(nextState, preEvents + postEvents)
  nextState = applyArcUpdates(nextState, arcUpdates)

  sceneContext = narrationContextAssembler.build({
    previousState: state,
    nextState,
    action,
    events: preEvents + postEvents,
    effects: triggeredEffects,
    arcUpdates
  })

  narration = narrationService.generateActionNarration(sceneContext)

  return {
    state: nextState,
    narration,
    summary: summarizeMechanicalChanges(outcome, triggeredEffects, arcUpdates)
  }
```

## 5. Turn resolution

```text
resolve(context):
  switch context.action.type:

    case ATTEND_CLASS:
      return resolveAttendClass(context)

    case PRACTICE_SPELL:
      return resolvePracticeSpell(context)

    case TALK_TO_NPC:
      return resolveConversation(context)

    case EXPLORE:
      return resolveExploration(context)

    case USE_SPELL:
      return resolveSpellUse(context)

    case STUDY:
      return resolveStudy(context)

    case REST:
      return resolveRest(context)

    case DUEL:
      return resolveDuel(context)

    default:
      return invalidActionOutcome("Unsupported action")
```

## 6. Spell practice example

```text
resolvePracticeSpell(context):
  spell = getSpellDefinition(context.action.spellId)
  player = context.state.player

  if not player.knows(spell):
    return failure("You do not know that spell.")

  if not hasEnoughEnergy(player, spell):
    return failure("You are too exhausted to practice it now.")

  chance = computePracticeSuccessChance({
    playerStats: player.stats,
    spellProgress: player.spellbook.getProgress(spell.id),
    stress: player.stress,
    location: context.state.currentLocation,
    modifiers: getActiveModifiers(context.state)
  })

  roll = rng.rollPercent()

  if roll <= chance.criticalSuccess:
    return successOutcome({
      stateChanges: [
        gainSpellMastery(spell.id, amount = HIGH),
        spendEnergy(spell.cost),
        reduceStress(SMALL)
      ],
      events: [
        SpellPracticed(spell.id),
        SpellMasteryIncreased(spell.id),
        SpellBreakthroughAchieved(spell.id)
      ]
    })

  if roll <= chance.success:
    return successOutcome({
      stateChanges: [
        gainSpellMastery(spell.id, amount = MEDIUM),
        spendEnergy(spell.cost)
      ],
      events: [
        SpellPracticed(spell.id),
        SpellMasteryIncreased(spell.id)
      ]
    })

  if roll <= chance.partial:
    return partialOutcome({
      stateChanges: [
        gainSpellMastery(spell.id, amount = LOW),
        spendEnergy(spell.cost),
        addStress(SMALL)
      ],
      events: [
        SpellPracticed(spell.id),
        MinorMiscastOccurred(spell.id)
      ]
    })

  return failureOutcome({
    stateChanges: [
      spendEnergy(spell.cost),
      addStress(MEDIUM)
    ],
    events: [
      SpellPracticeFailed(spell.id),
      MiscastOccurred(spell.id)
    ]
  })
```

## 7. Relationship update example

```text
resolveConversation(context):
  npc = getNpc(context.action.npcId)
  relationship = getRelationship(context.state.player.id, npc.id)
  topic = context.action.topic

  conversationOutcome = evaluateConversation({
    npcTraits: npc.traits,
    npcBoundaries: npc.boundaries,
    topic,
    playerHistory: getRecentHistory(context.state, npc.id),
    relationship,
    currentMood: getNpcMood(context.state, npc.id)
  })

  changes = []
  events = []

  changes += adjustRelationship(npc.id, conversationOutcome.relationshipDelta)
  events += ConversationCompleted(npc.id)

  if conversationOutcome.unlockedSecret:
    events += SecretLearned(npc.id, conversationOutcome.secretId)

  if conversationOutcome.unlockedRomanceFlag:
    events += RomanceFlagUnlocked(npc.id)

  return outcome(changes, events)
```

## 8. Event processing model

```text
eventBus.publish(events):
  for each event in events:
    handlers = registry.getHandlers(event.type)
    for each handler in handlers:
      handlerResult = handler.handle(event)
      collect(handlerResult.effects)
      collect(handlerResult.followUpEvents)
```

Possible handlers include:

- quest progression handler
- relationship reaction handler
- rumor generation handler
- faction reputation handler
- school discipline handler
- schedule unlock handler
- romance scene eligibility handler

## 9. Plot arc progression

```text
updatePlotArcs(state, events):
  for each activeArc in state.plotArcs:
    triggers = findMatchingTriggers(activeArc, events, state)

    if triggers found:
      activeArc = advanceArc(activeArc, triggers)
      state = updateArcState(state, activeArc)

      if activeArc.revealUnlocked:
        emit PlotRevealUnlocked(activeArc.id, activeArc.currentReveal)

      if activeArc.climaxReady:
        emit ArcClimaxAvailable(activeArc.id)

  return state
```

## 10. Narration generation

```text
generateActionNarration(sceneContext):
  prompt = promptBuilder.buildActionPrompt(sceneContext)
  rawOutput = provider.generate(prompt)
  checkedOutput = outputPolicy.validate(rawOutput)

  if checkedOutput invalid:
    return fallbackNarrator.render(sceneContext)

  return checkedOutput.text
```

The narration context should include:

- current location
- player action
- recent important events
- visible NPCs
- active quest hints
- emotional tone
- relevant lore snippets
- allowed style and safety constraints

## 11. Save and load behavior

```text
saveGame(state, slotId):
  snapshot = serializeCanonicalState(state)
  repository.writeSnapshot(slotId, snapshot)
  repository.appendEventJournal(slotId, state.recentEvents)

loadGame(slotId):
  snapshot = repository.readSnapshot(slotId)
  state = deserializeCanonicalState(snapshot)
  return state
```

Canonical state should store mechanics and world facts only. Generated narration should be optional cached data, never the single source of truth.

## 12. Extension model

```text
loadContentPacks(paths):
  packs = []
  for each path in paths:
    pack = parsePack(path)
    validatePackSchema(pack)
    packs.push(pack)

  registry = mergePacks(packs)
  registerRuleHooks(registry.hooks)
  return registry
```

```text
registerPlugin(plugin):
  plugin.register({
    actionRegistry,
    eventBus,
    contentRegistry,
    ruleEngine,
    rendererRegistry
  })
```

## 13. Guiding rule for the whole runtime

```text
Mechanics decide what happened.
AI decides how it is described.
Content defines what can exist.
The CLI decides how the player interacts with it.
Persistence decides how it survives between sessions.
```

That separation is what keeps the game modular, flexible, and extensible as it grows.
