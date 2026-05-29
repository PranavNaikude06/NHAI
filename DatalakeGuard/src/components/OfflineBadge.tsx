// src/components/OfflineBadge.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Colors, Typography } from '../constants/colors';

export const OfflineBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return (
    <View style={[styles.container, isOnline ? styles.onlineBorder : styles.offlineBorder]}>
      <View style={[styles.dot, { backgroundColor: isOnline ? Colors.success : Colors.danger }]} />
      <Text style={[styles.text, { color: isOnline ? Colors.success : Colors.danger }]}>
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  onlineBorder: {
    borderColor: 'rgba(52, 168, 83, 0.2)',
    backgroundColor: 'rgba(52, 168, 83, 0.1)',
  },
  offlineBorder: {
    borderColor: 'rgba(234, 67, 53, 0.2)',
    backgroundColor: 'rgba(234, 67, 53, 0.1)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    ...Typography.labelMd,
    fontWeight: 'bold',
    fontSize: 10,
  },
});
