import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { AsciiTitle } from "./components/AsciiTitle";
import { MainMenu, MenuOption } from "./components/MainMenu";
import { LoadingScreen } from "./components/LoadingScreen";
import { GameScreen } from "./components/GameScreen";
import { IGameEngine } from "../../types";
import { StartupProgressUpdate } from "../../bootstrap/engineFactory";

// ─── App phases ───────────────────────────────────────────────────────────────
type Phase = "menu" | "loading" | "game" | "startup-error";

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

const INITIAL_STARTUP_MILESTONES: StartupProgressUpdate[] = [
    {
        id: "content-packs",
        label: "Loading content packs",
        status: "pending",
        completed: 0,
        total: 0,
    },
    {
        id: "school-data",
        label: "Loading school data",
        status: "pending",
    },
    {
        id: "spellbook",
        label: "Preparing spellbook state",
        status: "pending",
    },
    {
        id: "ollama-check",
        label: "Checking Ollama availability",
        status: "pending",
    },
    {
        id: "campaign-blueprint",
        label: "Generating campaign blueprint",
        status: "pending",
    },
    {
        id: "year-blueprint",
        label: "Generating year blueprint",
        status: "pending",
    },
];

// ─── Options screen (minimal) ─────────────────────────────────────────────────
const OptionsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    useInput((_i, k) => {
        if (k.escape || (_i.toLowerCase() === "q")) onBack();
    });
    return (
        <Box flexDirection="column" paddingX={4}>
            <Text color="magenta" bold>⚙  Options</Text>
            <Text color="gray" dimColor>
                Narration mode: <Text color="white">AI / Fallback</Text>
            </Text>
            <Text color="gray" dimColor>
                Romance intensity: <Text color="white">medium</Text>
            </Text>
            <Text color="gray" dimColor>
                Display style: <Text color="white">default</Text>
            </Text>
            <Text color="cyan" dimColor>  (Press Esc or Q to go back)</Text>
        </Box>
    );
};

// ─── Root component ───────────────────────────────────────────────────────────
interface InkAppProps {
    /** Called by the app when it needs the engine to be ready.
     *  The promise resolves with the initialised engine. */
    engineFactory: (
        onProgress?: (update: StartupProgressUpdate) => void,
    ) => Promise<IGameEngine>;
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
    const [showOptions, setShowOptions] = useState(false);
    const [startupError, setStartupError] = useState<string | null>(null);
    const [loadingMilestones, setLoadingMilestones] = useState<StartupProgressUpdate[]>(
        INITIAL_STARTUP_MILESTONES,
    );

    const updateLoadingMilestone = (update: StartupProgressUpdate) => {
        setLoadingMilestones((current) =>
            current.map((milestone) =>
                milestone.id === update.id
                    ? {
                        ...milestone,
                        ...update,
                    }
                    : milestone,
            ),
        );
    };

    const startLoading = async (choice: string) => {
        setStartupError(null);
        setLoadingMilestones(INITIAL_STARTUP_MILESTONES);
        setPhase("loading");

        try {
            const eng = await engineFactory(updateLoadingMilestone);
            if (choice === "continue" || choice === "load") {
                try {
                    await eng.handleCommand("load autosave");
                } catch { /* ignore, fall through to fresh state */ }
            }
            setInitialOutput(eng.state.output || "Welcome, wizard. The world awaits.");
            setEngine(eng);
            setPhase("game");
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Startup failed.";
            setStartupError(message);
            setPhase("startup-error");
            setTimeout(() => exit(), 1800);
        }
    };

    // ── Menu selection ────────────────────────────────────────────────────────
    const handleMenuSelect = async (value: string) => {
        if (value === "quit") { exit(); return; }
        if (value === "options") { setShowOptions(true); return; }
        await startLoading(value);
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
                    milestones={loadingMilestones}
                />
            )}

            {phase === "game" && engine && (
                <GameScreen
                    engine={engine}
                    initialOutput={initialOutput}
                    locationNameResolver={locationNameResolver}
                />
            )}

            {phase === "startup-error" && startupError && (
                <Box flexDirection="column" paddingX={4}>
                    <Text color="red" bold>
                        Startup failed
                    </Text>
                    <Text color="white">{startupError}</Text>
                    <Text color="gray" dimColor>
                        Exiting application…
                    </Text>
                </Box>
            )}
        </Box>
    );
};
