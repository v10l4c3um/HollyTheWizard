import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { StartupProgressUpdate } from "../../../bootstrap/engineFactory";

interface LoadingScreenProps {
    milestones: StartupProgressUpdate[];
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    milestones,
}) => {
    const [spinFrame, setSpinFrame] = useState(0);

    const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const BAR_WIDTH = 30;

    useEffect(() => {
        const interval = setInterval(() => {
            setSpinFrame((f) => f + 1);
        }, 80);

        return () => clearInterval(interval);
    }, []);

    const completed = milestones.filter((m) => m.status === "done").length;
    const overallPercent =
        milestones.length === 0
            ? 0
            : Math.round((completed / milestones.length) * 100);
    const filled = Math.floor((overallPercent / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const activeIndex = milestones.findIndex((m) => m.status === "in_progress");

    return (
        <Box flexDirection="column" paddingX={4} paddingY={1}>
            <Text color="magenta" bold>
                Loading world…
            </Text>
            <Text color="cyan">
                [{bar}] {String(overallPercent).padStart(3)}%
            </Text>
            <Box marginTop={1} flexDirection="column">
                {milestones.map((milestone, i) => {
                    const done = milestone.status === "done";
                    const active = milestone.status === "in_progress";
                    const progressSuffix =
                        active &&
                        typeof milestone.completed === "number" &&
                        typeof milestone.total === "number"
                            ? ` (${milestone.completed}/${milestone.total})`
                            : "";
                    return (
                        <Box key={i} flexDirection="row">
                            <Text color={done ? "green" : active ? "cyan" : "gray"}>
                                {done ? "✓" : active ? SPIN_FRAMES[spinFrame % SPIN_FRAMES.length] : "○"}
                            </Text>
                            <Text> </Text>
                            <Text color={done ? "green" : active ? "white" : "gray"}>
                                {`${milestone.label}${progressSuffix}`.padEnd(46)}
                            </Text>
                            {active && i === activeIndex && (
                                <Text color="cyan">
                                    {milestone.detail ?? ""}
                                </Text>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
