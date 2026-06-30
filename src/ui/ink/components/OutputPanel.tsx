import React from "react";
import { Box, Text } from "ink";

interface OutputPanelProps {
    lines: string[];
    maxLines?: number;
}

/**
 * Renders the last N lines of game output. New lines fade in via color.
 */
export const OutputPanel: React.FC<OutputPanelProps> = ({
    lines,
    maxLines = 12,
}) => {
    const visible = lines.slice(-maxLines);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            flexGrow={1}
            minHeight={6}
        >
            {visible.length === 0 && (
                <Text color="gray" dimColor>
                    — awaiting input —
                </Text>
            )}
            {visible.map((line, i) => {
                const isFresh = i === visible.length - 1;
                const isRecent = i >= visible.length - 3;
                const color: "white" | "gray" = isFresh ? "white" : "gray";
                const dim = !isRecent;
                return (
                    <Text key={i} color={color} dimColor={dim}>
                        {line}
                    </Text>
                );
            })}
        </Box>
    );
};
