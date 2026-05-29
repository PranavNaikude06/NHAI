// src/components/FaceOvalGuide.tsx

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, Mask, Rect, Ellipse } from 'react-native-svg';
import { Colors } from '../constants/colors';

interface FaceOvalGuideProps {
  status: 'no_face' | 'face_detected' | 'liveness_active' | 'success' | 'failure';
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const FaceOvalGuide: React.FC<FaceOvalGuideProps> = ({ status }) => {
  let strokeColor = Colors.outline;
  if (status === 'face_detected') {
    strokeColor = Colors.text;
  } else if (status === 'liveness_active') {
    strokeColor = Colors.warning;
  } else if (status === 'success') {
    strokeColor = Colors.success;
  } else if (status === 'failure') {
    strokeColor = Colors.danger;
  }

  // Oval coordinates: perfect 1:1.5 ratio
  const rx = screenWidth * 0.32; // Horizontal radius
  const ry = rx * 1.45;           // 1:1.45 ratio for display height fit
  const cx = screenWidth / 2;
  const cy = screenHeight * 0.38; // Centered vertically in active viewport

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height={screenHeight} width={screenWidth} style={styles.svg}>
        <Defs>
          <Mask id="mask">
            {/* White overlay covers the entire screen */}
            <Rect width={screenWidth} height={screenHeight} fill="#ffffff" />
            {/* Black oval cuts hole in mask */}
            <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000000" />
          </Mask>
        </Defs>
        {/* Semi-transparent dark background applied with mask */}
        <Rect
          width={screenWidth}
          height={screenHeight}
          fill="rgba(10, 10, 10, 0.75)"
          mask="url(#mask)"
        />
        {/* Highlighted border around the oval */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
        />
      </Svg>
      
      {/* Corner Accents around oval */}
      <View style={[styles.cornerAccent, styles.topLeft, { borderColor: strokeColor }]} />
      <View style={[styles.cornerAccent, styles.topRight, { borderColor: strokeColor }]} />
      <View style={[styles.cornerAccent, styles.bottomLeft, { borderColor: strokeColor }]} />
      <View style={[styles.cornerAccent, styles.bottomRight, { borderColor: strokeColor }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  svg: {
    ...StyleSheet.absoluteFill,
  },
  cornerAccent: {
    position: 'absolute',
    width: 24,
    height: 24,
    pointerEvents: 'none',
  },
  topLeft: {
    top: screenHeight * 0.38 - (screenWidth * 0.32 * 1.45) - 8,
    left: screenWidth / 2 - (screenWidth * 0.32) - 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  topRight: {
    top: screenHeight * 0.38 - (screenWidth * 0.32 * 1.45) - 8,
    right: screenWidth / 2 - (screenWidth * 0.32) - 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bottomLeft: {
    top: screenHeight * 0.38 + (screenWidth * 0.32 * 1.45) - 16,
    left: screenWidth / 2 - (screenWidth * 0.32) - 8,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bottomRight: {
    top: screenHeight * 0.38 + (screenWidth * 0.32 * 1.45) - 16,
    right: screenWidth / 2 - (screenWidth * 0.32) - 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
});
