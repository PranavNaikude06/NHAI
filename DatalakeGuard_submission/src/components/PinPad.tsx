// src/components/PinPad.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../constants/colors';

interface PinPadProps {
  onPressKey: (value: string) => void;
  onPressHelp?: () => void;
}

export const PinPad: React.FC<PinPadProps> = ({ onPressKey, onPressHelp }) => {
  const renderNumberButton = (num: string) => (
    <TouchableOpacity
      key={num}
      style={styles.keypadButton}
      activeOpacity={0.7}
      onPress={() => onPressKey(num)}
    >
      <Text style={styles.keypadText}>{num}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.gridContainer}>
      {/* Rows 1 to 3 */}
      <View style={styles.row}>
        {renderNumberButton('1')}
        {renderNumberButton('2')}
        {renderNumberButton('3')}
      </View>
      <View style={styles.row}>
        {renderNumberButton('4')}
        {renderNumberButton('5')}
        {renderNumberButton('6')}
      </View>
      <View style={styles.row}>
        {renderNumberButton('7')}
        {renderNumberButton('8')}
        {renderNumberButton('9')}
      </View>
      {/* Bottom Row */}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.helpButton}
          activeOpacity={0.7}
          onPress={onPressHelp}
        >
          <Text style={styles.helpText}>HELP</Text>
        </TouchableOpacity>
        
        {renderNumberButton('0')}

        <TouchableOpacity
          style={styles.keypadButton}
          activeOpacity={0.7}
          onPress={() => onPressKey('back')}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"
              fill={Colors.text}
            />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 16,
  },
  keypadButton: {
    height: 72,
    width: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  keypadText: {
    ...Typography.titleMd,
    fontSize: 24,
    color: Colors.text,
  },
  helpButton: {
    height: 72,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: 'bold',
  },
});
