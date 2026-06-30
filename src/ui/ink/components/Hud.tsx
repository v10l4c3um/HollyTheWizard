import React from "react";
import { Box, Text } from "ink";
import GameState from "../../../core/domain/world/GameState";

interface HudProps {
    state: GameState;
    locationName: string;
}

function resourceBar(value: number, max: number, width = 12): string {
    const filled = Math.round((value / max) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}

function barColor(value: number, max: number): "green" | "yellow" | "red" {
    const ratio = value / max;
    if (ratio > 0.6) return "green";
    if (ratio > 0.3) return "yellow";
    return "red";
}

function timeIcon(timeOfDay: string): string {
    switch (timeOfDay) {
        case "morning": return "🌅";
        case "afternoon": return "☀️ ";
        case "evening": return "🌆";
        case "night": return "🌙";
        default: return "⏰";
    }
}

export const Hud: React.FC<HudProps> = ({ state, locationName }) => {
    const { player, worldClock } = state;
    const stats = player.stats;
    const res = stats.resources;
    const chr = stats.character;

    const timeStr = worldClock.getCurrentTime();
    const timeOfDay = worldClock.timeOfDay;

    return (
        <Box
            flexDirection="row"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            gap={3}
            flexWrap="wrap"
        >
            {/* Time & Location */}
            <Box flexDirection="column" gap={0}>
                <Text color="cyan" bold>
                    {timeIcon(timeOfDay)} {timeStr}{" "}
                    <Text color="gray" dimColor>({timeOfDay})</Text>
                </Text>
                <Text color="yellow">
                    📍 <Text bold>{locationName}</Text>
                </Text>
            </Box>

            {/* Divider */}
            <Text color="gray" dimColor>│</Text>

            {/* Resources */}
            <Box flexDirection="column" gap={0}>
                <Box flexDirection="row" gap={1}>
                    <Text color="red">❤  </Text>
                    <Text color={barColor(res.health, 100)}>{resourceBar(res.health, 100)}</Text>
                    <Text color="gray" dimColor> {res.health}</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                    <Text color="blue">✦  </Text>
                    <Text color={barColor(res.mana, 100)}>{resourceBar(res.mana, 100)}</Text>
                    <Text color="gray" dimColor> {res.mana}</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                    <Text color="green">⚡ </Text>
                    <Text color={barColor(res.stamina, 100)}>{resourceBar(res.stamina, 100)}</Text>
                    <Text color="gray" dimColor> {res.stamina}</Text>
                </Box>
            </Box>

            {/* Divider */}
            <Text color="gray" dimColor>│</Text>

            {/* Character Stats */}
            <Box flexDirection="row" gap={2}>
                <Box flexDirection="column" gap={0}>
                    <Text color="gray" dimColor>INT <Text color="white">{chr.intelligence}</Text></Text>
                    <Text color="gray" dimColor>STR <Text color="white">{chr.strength}</Text></Text>
                    <Text color="gray" dimColor>AGI <Text color="white">{chr.agility}</Text></Text>
                </Box>
                <Box flexDirection="column" gap={0}>
                    <Text color="gray" dimColor>CHA <Text color="white">{chr.charisma}</Text></Text>
                    <Text color="gray" dimColor>DEX <Text color="white">{chr.dexterity}</Text></Text>
                    <Text color="gray" dimColor>WIS <Text color="white">{chr.wisdom}</Text></Text>
                </Box>
            </Box>

            {/* Divider */}
            <Text color="gray" dimColor>│</Text>

            {/* Player name */}
            <Box flexDirection="column" gap={0}>
                <Text color="magenta" bold>{player.name}</Text>
                <Text color="gray" dimColor>{player.archetype} · Yr {state.currentYear}</Text>
            </Box>
        </Box>
    );
};
