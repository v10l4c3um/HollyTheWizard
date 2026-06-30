import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SpellBook from "../../../core/domain/magic/SpellBook";
import { SpellKnowledgeState } from "../../../core/domain/magic/Spell";

interface SpellbookWidgetProps {
    spellbook: SpellBook;
    /** Set to true to let the user navigate with arrow keys */
    interactive?: boolean;
}

const STATE_COLOR: Record<SpellKnowledgeState, string> = {
    hidden: "gray",
    available: "yellow",
    learned: "cyan",
    mastered: "green",
};

const STATE_ICON: Record<SpellKnowledgeState, string> = {
    hidden: "◌",
    available: "◎",
    learned: "●",
    mastered: "★",
};

function masteryBar(pct: number, width = 10): string {
    const filled = Math.round((pct / 100) * width);
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}

export const SpellbookWidget: React.FC<SpellbookWidgetProps> = ({
    spellbook,
    interactive = false,
}) => {
    const [cursor, setCursor] = useState(0);

    // Only include spells the player knows exist
    const visible = spellbook.getAllSpells().filter(
        (s) => s.knowledgeState !== "hidden",
    );

    useInput((_input, key) => {
        if (!interactive) return;
        if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
        if (key.downArrow) setCursor((c) => Math.min(visible.length - 1, c + 1));
    });

    if (visible.length === 0) {
        return (
            <Box
                flexDirection="column"
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                width={36}
            >
                <Text color="magenta" bold>✦ Spellbook</Text>
                <Text color="gray" dimColor>  No spells discovered yet…</Text>
            </Box>
        );
    }

    const selected = visible[cursor];

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="magenta"
            paddingX={1}
            width={36}
        >
            <Text color="magenta" bold>✦ Spellbook  </Text>
            <Text color="gray" dimColor>────────────────────────────────</Text>

            {visible.slice(0, 8).map((spell, i) => {
                const isActive = interactive && i === cursor;
                const color = STATE_COLOR[spell.knowledgeState] ?? "gray";
                const icon = STATE_ICON[spell.knowledgeState] ?? "◌";
                return (
                    <Box key={spell.spellId} flexDirection="row" gap={1}>
                        <Text color={isActive ? "white" : "gray"}>
                            {isActive ? "▶" : " "}
                        </Text>
                        <Text color={color}>{icon}</Text>
                        <Text color={isActive ? "white" : color} bold={isActive}>
                            {spell.spellId.replace(/_/g, " ").slice(0, 16).padEnd(16)}
                        </Text>
                        <Text color="cyan" dimColor>
                            {masteryBar(spell.masteryLevel)}
                        </Text>
                    </Box>
                );
            })}

            {visible.length > 8 && (
                <Text color="gray" dimColor>  + {visible.length - 8} more…</Text>
            )}

            {interactive && selected && (
                <>
                    <Text color="gray" dimColor>────────────────────────────────</Text>
                    <Box flexDirection="row" gap={1}>
                        <Text color="cyan" dimColor>Mastery:</Text>
                        <Text color="white">{selected.masteryLevel}</Text>
                        <Text color="gray" dimColor>  Proficiency:</Text>
                        <Text color="white">{selected.proficiency}</Text>
                    </Box>
                    <Box flexDirection="row" gap={1}>
                        <Text color="cyan" dimColor>State:</Text>
                        <Text color={STATE_COLOR[selected.knowledgeState] ?? "gray"}>
                            {selected.knowledgeState}
                        </Text>
                    </Box>
                </>
            )}
        </Box>
    );
};
