// src/screens/admin/AdminLoginScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Vibration, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../../constants/colors';
import { Config } from '../../constants/config';
import { PinPad } from '../../components/PinPad';

export const AdminLoginScreen = ({ navigation }: any) => {
  const [pin, setPin] = useState<string>('');
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutTime, setLockoutTime] = useState<number>(0);

  // Handle countdown if locked out
  useEffect(() => {
    if (lockoutTime > 0) {
      const timer = setInterval(() => {
        setLockoutTime(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutTime]);

  const handlePressKey = (val: string) => {
    if (lockoutTime > 0) return;

    if (val === 'back') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);

      // Verify PIN immediately when 4 digits are completed
      if (newPin.length === 4) {
        setTimeout(() => {
          if (newPin === Config.ADMIN_PIN_CODE) {
            setPin('');
            setFailedAttempts(0);
            navigation.replace('AdminDashboard');
          } else {
            Vibration.vibrate(200);
            const newFailed = failedAttempts + 1;
            setFailedAttempts(newFailed);
            setPin('');

            if (newFailed >= 3) {
              setLockoutTime(30);
              Alert.alert(
                'Security Lockout',
                'Too many failed attempts. Keypad locked for 30 seconds.'
              );
            } else {
              Alert.alert(
                'Access Denied',
                `Invalid administrator passcode. ${3 - newFailed} attempts remaining.`
              );
            }
          }
        }, 150);
      }
    }
  };

  const handlePressHelp = () => {
    Alert.alert('PIN Help', 'Use the administrator passcode provisioned for this device.');
  };

  return (
    <View style={styles.container}>
      {/* Back to Home Button */}
      <TouchableOpacityBack navigation={navigation} />

      {/* Brand Header */}
      <View style={styles.header}>
        <View style={styles.brandContainer}>
          <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <Path
              d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
              fill={Colors.primary}
            />
          </Svg>
          <Text style={styles.brandText}>DatalakeGuard</Text>
        </View>
        <Text style={styles.title}>Enter Admin PIN</Text>
        <Text style={styles.subtitle}>
          {lockoutTime > 0
            ? `SECURE LOCKOUT ACTIVE: ${lockoutTime}s`
            : 'Security clearance level 4 required'}
        </Text>
      </View>

      {/* PIN Dot Indicators */}
      <View style={styles.dotContainer}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              lockoutTime > 0 && styles.dotLocked,
            ]}
          />
        ))}
      </View>

      {/* Keypad */}
      <View style={lockoutTime > 0 ? styles.disabledPad : null}>
        <PinPad onPressKey={handlePressKey} onPressHelp={handlePressHelp} />
      </View>

      {/* Security Message */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <Path
              d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10z"
              fill={Colors.onSurfaceVariant}
            />
          </Svg>
          <Text style={styles.footerText}>End-to-End Encrypted Tunnel Active</Text>
        </View>
        <View style={styles.accentLine} />
      </View>
    </View>
  );
};

// Internal Back Button Component
const TouchableOpacityBack = ({ navigation }: any) => (
  <TouchableOpacity
    style={styles.backButton}
    activeOpacity={0.7}
    onPress={() => navigation.navigate('Home')}
  >
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
        fill={Colors.text}
      />
    </Svg>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 24,
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  brandText: {
    ...Typography.headlineLgMobile,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  title: {
    ...Typography.headlineLg,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 24,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
    // glow effect
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  dotLocked: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger,
    shadowColor: Colors.danger,
  },
  disabledPad: {
    opacity: 0.3,
  },
  footer: {
    alignItems: 'center',
    gap: 12,
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  accentLine: {
    width: 64,
    height: 4,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 2,
    opacity: 0.5,
  },
});
export default AdminLoginScreen;
