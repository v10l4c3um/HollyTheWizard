import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import GameState from "../../../core/domain/world/GameState";
import { IGameEngine } from "../../../types";
import { Hud } from "./Hud";
import { SpellbookWidget } from "./SpellbookWidget";
import { CommandInput } from "./CommandInput";
import { OutputPanel } from "./OutputPanel";

interface GameScreenProps {
    engine: IGameEngine;
    initialOutput: string;
    locationNameResolver: (id: string) => string;
}

export const GameScreen: React.FC<GameScreenProps> = ({
    engine,
    initialOutput,
    locationNameResolver,
}) => {
    const { exit } = useApp();
    const [state, setState] = useState<GameState>(engine.state);
    const [outputLines, setOutputLines] = useState<string[]>(() =>
        initialOutput.split("\n").filter(Boolean),
    );
    const [busy, setBusy] = useState(false);
    const [showSpellbook, setShowSpellbook] = useState(false);

    const handleCommand = useCallback(
        async (cmd: string) => {
            const lower = cmd.toLowerCase().trim();
            if (lower === "quit" || lower === "exit") {
                setOutputLines((l) => [...l, "Farewell, wizard. May your spells never backfire."]);
                setTimeout(() => exit(), 800);
                return;
            }
            if (lower === "spellbook" || lower === "sb") {
                setShowSpellbook((s) => !s);
                setOutputLines((l) => [...l, showSpellbook ? "Spellbook closed." : "Opening spellbook…"]);
                return;
            }

            setBusy(true);
            try {
                const next = await engine.handleCommand(cmd);
                setState(next);
                const lines = next.output.split("\n").filter(Boolean);
                setOutputLines((prev) => [...prev, `▶ ${cmd}`, ...lines]);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setOutputLines((prev) => [...prev, `✗ Error: ${msg}`]);
            } finally {
                setBusy(false);
            }
        },
        [engine, exit, showSpellbook],
    );

    const locationName = locationNameResolver(state.currentLocationId);

    return (
        <Box flexDirection="column" padding={0}>
            {/* HUD */}
            <Hud state={state} locationName={locationName} />

            {/* Main content row */}
            <Box flexDirection="row" flexGrow={1}>
                {/* Left: output panel */}
                <Box flexDirection="column" flexGrow={1}>
                    <OutputPanel lines={outputLines} maxLines={14} />
                </Box>

                {/* Right: spellbook sidebar (toggle) */}
                {showSpellbook && (
                    <Box marginLeft={1}>
                        <SpellbookWidget spellbook={state.spellbook} interactive />
                    </Box>
                )}
            </Box>

            {/* Command input */}
            <Box
                flexDirection="column"
                borderStyle="single"
                borderColor={busy ? "yellow" : "magenta"}
                paddingX={1}
            >
                <CommandInput
                    onSubmit={handleCommand}
                    disabled={busy}
                    placeholder="move · study · practice · rest · talk · inspect · spellbook · help"
                />
            </Box>

            {/* Footer hints */}
            <Box paddingX={2}>
                <Text color="gray" dimColor>
                    ↑↓ history · Tab spellbook · quit to exit{" "}
                    {showSpellbook && "· spellbook open"}
                </Text>
            </Box>
        </Box>
    );
};
