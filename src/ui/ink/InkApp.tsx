import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { AsciiTitle } from "./components/AsciiTitle";
import { MainMenu, MenuOption } from "./components/MainMenu";
import { LoadingScreen } from "./components/LoadingScreen";
import { GameScreen } from "./components/GameScreen";
import { IGameEngine } from "../../types";

// ─── App phases ───────────────────────────────────────────────────────────────
type Phase = "menu" | "loading" | "game";

const MENU_OPTIONS: MenuOption[] = [
    {
        label: "New Game",
        description: "Begin a new journey as a first-year wizard",
        value: "new",
    },
    {
        label: "Continue",
        description: "Load your most recent autosave",
        value: "continue",
    },
    {
        label: "Load Save",
        description: "Choose a save file to restore",
        value: "load",
    },
    {
        label: "Options",
        description: "Narration mode, difficulty, and display settings",
        value: "options",
    },
    {
        label: "Quit",
        description: "Exit the game",
        value: "quit",
    },
];

const LOADING_STEPS = [
    { label: "Loading spell packs", durationMs: 900 },
    { label: "Loading NPC packs", durationMs: 700 },
    { label: "Loading school data", durationMs: 800 },
    { label: "Building world state", durationMs: 600 },
];

// ─── Options screen (minimal) ─────────────────────────────────────────────────
const OptionsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    useInput((_i, k) => {
        if (k.escape || (_i.toLowerCase() === "q")) onBack();
    });
    return (
        <Box flexDirection="column" paddingX={4} gap={1}>
            <Text color="magenta" bold>⚙  Options</Text>
            <Text color="gray" dimColor>Narration mode: <Text color="white">AI / Fallback</Text></Text>
            <Text color="gray" dimColor>Romance intensity: <Text color="white">medium</Text></Text>
            <Text color="gray" dimColor>Display style: <Text color="white">default</Text></Text>
            <Text color="cyan" dimColor>  (Press Esc or Q to go back)</Text>
        </Box>
    );
};

// ─── Root component ───────────────────────────────────────────────────────────
interface InkAppProps {
    /** Called by the app when it needs the engine to be ready.
     *  The promise resolves with the initialised engine. */
    engineFactory: () => Promise<IGameEngine>;
    locationNameResolver: (id: string) => string;
}

export const InkApp: React.FC<InkAppProps> = ({
    engineFactory,
    locationNameResolver,
}) => {
    const { exit } = useApp();
    const [phase, setPhase] = useState<Phase>("menu");
    const [engine, setEngine] = useState<IGameEngine | null>(null);
    const [initialOutput, setInitialOutput] = useState<string>("");
    const [menuChoice, setMenuChoice] = useState<string | null>(null);
    const [showOptions, setShowOptions] = useState(false);

    // ── Menu selection ────────────────────────────────────────────────────────
    const handleMenuSelect = async (value: string) => {
        if (value === "quit") { exit(); return; }
        if (value === "options") { setShowOptions(true); return; }
        setMenuChoice(value);
        setPhase("loading");
    };

    // ── Loading complete ──────────────────────────────────────────────────────
    const handleLoadingComplete = async () => {
        const eng = await engineFactory();
        if (menuChoice === "continue" || menuChoice === "load") {
            try {
                await eng.handleCommand("load autosave");
            } catch { /* ignore, fall through to fresh state */ }
        }
        setInitialOutput(eng.state.output || "Welcome, wizard. The world awaits.");
        setEngine(eng);
        setPhase("game");
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Box flexDirection="column" padding={1}>
            <AsciiTitle />

            {phase === "menu" && !showOptions && (
                <MainMenu options={MENU_OPTIONS} onSelect={handleMenuSelect} />
            )}

            {phase === "menu" && showOptions && (
                <OptionsScreen onBack={() => setShowOptions(false)} />
            )}

            {phase === "loading" && (
                <LoadingScreen
                    steps={LOADING_STEPS}
                    onComplete={handleLoadingComplete}
                />
            )}

            {phase === "game" && engine && (
                <GameScreen
                    engine={engine}
                    initialOutput={initialOutput}
                    locationNameResolver={locationNameResolver}
                />
            )}
        </Box>
    );
};
