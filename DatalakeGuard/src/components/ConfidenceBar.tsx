// src/components/ConfidenceBar.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../constants/colors';

interface ConfidenceBarProps {
  confidence: number; // 0 to 1
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({ confidence }) => {
  const percentage = Math.min(100, Math.max(0, confidence * 100));

  let barColor = Colors.danger;
  let statusText = 'Low Match';

  if (confidence >= 0.75) {
    barColor = Colors.success;
    statusText = 'High Match';
  } else if (confidence >= 0.60) {
    barColor = Colors.primary;
    statusText = 'Secure Match';
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Confidence Score</Text>
        <Text style={[styles.value, { color: barColor }]}>
          {percentage.toFixed(1)}% ({statusText})
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${percentage}%`,
              backgroundColor: barColor,
              shadowColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  value: {
    ...Typography.bodyMd,
    fontWeight: 'bold',
  },
  track: {
    height: 8,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
});
