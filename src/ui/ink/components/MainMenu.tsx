import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";

export type MenuOption = {
    label: string;
    description: string;
    value: string;
};

interface MainMenuProps {
    options: MenuOption[];
    onSelect: (value: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ options, onSelect }) => {
    const [selected, setSelected] = useState(0);
    const [pulse, setPulse] = useState(false);

    // Blinking cursor pulse
    useEffect(() => {
        const t = setInterval(() => setPulse((p) => !p), 500);
        return () => clearInterval(t);
    }, []);

    useInput((input, key) => {
        if (key.upArrow) {
            setSelected((s) => (s - 1 + options.length) % options.length);
        } else if (key.downArrow) {
            setSelected((s) => (s + 1) % options.length);
        } else if (key.return) {
            onSelect(options[selected]!.value);
        }
    });

    return (
        <Box flexDirection="column" paddingX={4}>
            <Box marginBottom={1} flexDirection="row">
                <Text color="cyan">✦</Text>
                <Text> </Text>
                <Text color="white" dimColor>
                    Use ↑↓ to navigate  ·  Enter to select
                </Text>
            </Box>

            {options.map((opt, i) => {
                const isActive = i === selected;
                return (
                    <Box key={i} flexDirection="row">
                        <Text color={isActive ? "magenta" : "gray"}>
                            {isActive ? (pulse ? "▶" : "▷") : " "}
                        </Text>
                        <Text>  </Text>
                        <Box flexDirection="column">
                            <Text
                                color={isActive ? "white" : "gray"}
                                bold={isActive}
                                underline={isActive}
                            >
                                {opt.label}
                            </Text>
                            {isActive && (
                                <Text color="cyan" dimColor>
                                    {opt.description}
                                </Text>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
