// src/screens/admin/EnrollScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../../constants/colors';
import { OfflineBadge } from '../../components/OfflineBadge';

export const EnrollScreen = ({ navigation }: any) => {
  const [name, setName] = useState<string>('');
  const [workerId, setWorkerId] = useState<string>('');
  const [role, setRole] = useState<string>('Field Worker');

  const roles = ['Field Worker', 'Supervisor', 'Admin'];

  const handleNext = () => {
    // Basic Input Validations
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter the worker name.');
      return;
    }
    if (!workerId.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid Worker ID.');
      return;
    }
    const cleanId = workerId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      Alert.alert('Validation Error', 'Worker ID can only contain alphanumeric characters, hyphens, and underscores.');
      return;
    }

    navigation.navigate('EnrollCamera', {
      name: name.trim(),
      role: role,
      workerId: cleanId,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
              fill={Colors.text}
            />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enrollment</Text>
        <OfflineBadge />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.sectionLabel}>NEW WORKER REGISTRATION</Text>
          <Text style={styles.mainTitle}>Profile Enrolment</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Worker Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              placeholderTextColor="rgba(255, 255, 255, 0.25)"
              value={name}
              onChangeText={setName}
              maxLength={40}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Worker ID (Unique)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. EMP-105"
              placeholderTextColor="rgba(255, 255, 255, 0.25)"
              value={workerId}
              onChangeText={setWorkerId}
              autoCapitalize="characters"
              maxLength={15}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Assigned Role</Text>
            <View style={styles.roleSelector}>
              {roles.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleOption,
                    role === r && styles.roleOptionActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setRole(r)}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      role === r && styles.roleOptionTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Security Warning Information block */}
        <View style={styles.warningCard}>
          <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={styles.warningIcon}>
            <Path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              fill={Colors.warning}
            />
          </Svg>
          <Text style={styles.warningText}>
            Ensuring high-fidelity biometrics: capture requires 5 consistent facial frames in a well-lit environment.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={styles.submitButton}
          activeOpacity={0.8}
          onPress={handleNext}
        >
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.btnIcon}>
            <Path
              d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
              fill={Colors.text}
            />
          </Svg>
          <Text style={styles.submitButtonText}>Start Camera Capture</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: Colors.surfaceContainer,
    borderBottomWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    ...Typography.titleMd,
    color: Colors.text,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 28,
  },
  titleSection: {
    gap: 4,
  },
  sectionLabel: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  mainTitle: {
    ...Typography.headlineLg,
    color: Colors.text,
    fontSize: 26,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontWeight: 'bold',
  },
  input: {
    height: 48,
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: Colors.text,
    ...Typography.bodyLg,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  roleOption: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleOptionActive: {
    backgroundColor: 'rgba(26, 115, 232, 0.15)',
    borderColor: Colors.primary,
  },
  roleOptionText: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
  },
  roleOptionTextActive: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(251, 188, 4, 0.05)',
    borderColor: 'rgba(251, 188, 4, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  warningIcon: {
    marginTop: 2,
  },
  warningText: {
    ...Typography.bodyMd,
    color: Colors.onSurface,
    flex: 1,
    lineHeight: 18,
    opacity: 0.85,
  },
  submitButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 12,
  },
  submitButtonText: {
    ...Typography.titleMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  btnIcon: {
    marginRight: 8,
  },
});
export default EnrollScreen;
