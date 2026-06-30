import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface LoadingScreenProps {
    steps: { label: string; durationMs: number }[];
    onComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    steps,
    onComplete,
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [progress, setProgress] = useState(0); // 0-100 per step
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [spinFrame, setSpinFrame] = useState(0);

    const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const BAR_WIDTH = 28;

    useEffect(() => {
        if (currentStep >= steps.length) {
            setTimeout(onComplete, 300);
            return;
        }

        const step = steps[currentStep];
        const tickMs = 60;
        const totalTicks = Math.floor(step.durationMs / tickMs);
        let tick = 0;

        const interval = setInterval(() => {
            tick++;
            const pct = Math.min(100, Math.round((tick / totalTicks) * 100));
            setProgress(pct);
            setSpinFrame((f) => f + 1);

            if (tick >= totalTicks) {
                clearInterval(interval);
                setCompletedSteps((prev) => [...prev, currentStep]);
                setProgress(0);
                setCurrentStep((s) => s + 1);
            }
        }, tickMs);

        return () => clearInterval(interval);
    }, [currentStep]);

    const filled = Math.floor((progress / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);

    return (
        <Box flexDirection="column" paddingX={4} paddingY={1}>
            <Text color="magenta" bold>
                Loading world…
            </Text>
            <Box marginTop={1} flexDirection="column" gap={0}>
                {steps.map((step, i) => {
                    const done = completedSteps.includes(i);
                    const active = i === currentStep;
                    return (
                        <Box key={i} flexDirection="row" gap={1} marginBottom={0}>
                            <Text color={done ? "green" : active ? "cyan" : "gray"}>
                                {done ? "✓" : active ? SPIN_FRAMES[spinFrame % SPIN_FRAMES.length] : "○"}
                            </Text>
                            <Text color={done ? "green" : active ? "white" : "gray"}>
                                {step.label.padEnd(28)}
                            </Text>
                            {active && (
                                <Text color="cyan">
                                    [{bar}] {String(progress).padStart(3)}%
                                </Text>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
