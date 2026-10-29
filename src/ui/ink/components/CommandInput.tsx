import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";

// ────────────────────────────────────────────────────────────
//  Known commands, used only for hints. Input is never blocked here:
//  free text is parsed by the engine's resolver.
// ────────────────────────────────────────────────────────────
const COMMAND_CATALOG: {
    cmd: string;
    args?: string;
    hint: string;
}[] = [
        { cmd: "move", args: "<location>", hint: "Travel to a connected location" },
        { cmd: "go", args: "<location>", hint: "Alias for move" },
        { cmd: "study", args: "[subject]", hint: "Study a subject or your spellbook" },
        { cmd: "practice", args: "<spell>", hint: "Practice a spell" },
        { cmd: "cast", args: "<spell>", hint: "Alias for practice" },
        { cmd: "attend", args: "[subject]", hint: "Attend the class that is on now" },
        { cmd: "advance", hint: "Advance to the next school year" },
        { cmd: "rest", hint: "Rest and restore energy" },
        { cmd: "talk", args: "<npc>", hint: "Speak with an NPC" },
        { cmd: "inspect", args: "[subject]", hint: "View inventory or spellbook" },
        { cmd: "spellbook", hint: "Open the spellbook view" },
        { cmd: "save", args: "<name>", hint: "Save the game" },
        { cmd: "load", args: "<name>", hint: "Load a saved game" },
        { cmd: "help", hint: "Show command list" },
        { cmd: "quit", hint: "Exit the game" },
    ];

// ────────────────────────────────────────────────────────────
//  Component
// ────────────────────────────────────────────────────────────
interface CommandInputProps {
    onSubmit: (command: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({
    onSubmit,
    disabled = false,
    placeholder = "Say what you want to do…",
}) => {
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const [blink, setBlink] = useState(true);
    const historyRef = useRef<string[]>([]);
    const histIdxRef = useRef(-1);

    // Blinking cursor
    useEffect(() => {
        const t = setInterval(() => setBlink((b) => !b), 500);
        return () => clearInterval(t);
    }, []);

    // Live hint as user types
    useEffect(() => {
        const word = value.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        if (!word) { setHint(null); setError(null); return; }
        const match = COMMAND_CATALOG.find((c) => c.cmd === word);
        if (match) {
            setHint(`${match.cmd}${match.args ? " " + match.args : ""}  —  ${match.hint}`);
            setError(null);
        } else {
            const partial = COMMAND_CATALOG.filter((c) => c.cmd.startsWith(word));
            if (partial.length > 0) {
                setHint(partial.map((c) => c.cmd).join("  |  "));
                setError(null);
            } else {
                setHint(null);
                setError(null);
            }
        }
    }, [value]);

    useInput((_input, key) => {
        if (disabled) return;

        if (key.return) {
            if (value.trim()) {
                historyRef.current.unshift(value.trim());
                histIdxRef.current = -1;
                onSubmit(value.trim());
                setValue("");
                setError(null);
                setHint(null);
            }
            return;
        }

        if (key.upArrow) {
            const hist = historyRef.current;
            const next = Math.min(histIdxRef.current + 1, hist.length - 1);
            histIdxRef.current = next;
            if (hist[next]) setValue(hist[next]);
            return;
        }

        if (key.downArrow) {
            const next = Math.max(histIdxRef.current - 1, -1);
            histIdxRef.current = next;
            setValue(next === -1 ? "" : (historyRef.current[next] ?? ""));
            return;
        }

        if (key.backspace || key.delete) {
            setValue((v) => v.slice(0, -1));
            return;
        }

        if (!key.ctrl && !key.meta && _input && _input.length === 1) {
            setValue((v) => v + _input);
        }
    });

    const cursor = blink ? "█" : " ";

    return (
        <Box flexDirection="column">
            {/* Hint row */}
            <Box>
                {hint && !error && (
                    <Text color="cyan" dimColor>
                        {hint}
                    </Text>
                )}
                {error && (
                    <Text color="red">
                        ✗ {error}
                    </Text>
                )}
            </Box>

            {/* Input row */}
            <Box flexDirection="row">
                <Text color={disabled ? "gray" : "magenta"} bold>
                    {disabled ? "⌛" : "▶"}
                </Text>
                <Text> </Text>
                <Text color="white">
                    {value || (blink ? "" : placeholder)}
                </Text>
                {!disabled && <Text color="cyan">{cursor}</Text>}
            </Box>
        </Box>
    );
};
