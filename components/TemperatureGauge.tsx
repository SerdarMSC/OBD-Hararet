import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 220;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MIN_TEMP = 0;
const MAX_TEMP = 140;

interface TemperatureGaugeProps {
  temperatureC: number | null;
  thresholdC: number;
}

export function TemperatureGauge({ temperatureC, thresholdC }: TemperatureGaugeProps) {
  const colors = useColors();
  const progress = useSharedValue(0);

  const clamped = temperatureC === null ? MIN_TEMP : Math.min(Math.max(temperatureC, MIN_TEMP), MAX_TEMP);
  const ratio = (clamped - MIN_TEMP) / (MAX_TEMP - MIN_TEMP);

  useEffect(() => {
    progress.value = withTiming(ratio, { duration: 600 });
  }, [ratio, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const isOverThreshold = temperatureC !== null && temperatureC >= thresholdC;
  const isNearThreshold = temperatureC !== null && temperatureC >= thresholdC - 10 && !isOverThreshold;

  const ringColor = isOverThreshold ? colors.destructive : isNearThreshold ? colors.warning : colors.primary;

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.muted}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={ringColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={styles.centerLabel}>
        <Text style={[styles.value, { color: colors.foreground }]}>
          {temperatureC === null ? "--" : Math.round(temperatureC)}
        </Text>
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>°C</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
  },
  value: {
    fontSize: 56,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: -4,
  },
});
