// src/navigation/AppNavigator.tsx

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Screens
import { SplashScreen } from '../screens/SplashScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { AuthCameraScreen } from '../screens/auth/AuthCameraScreen';
import { AuthResultScreen } from '../screens/auth/AuthResultScreen';
import { AdminLoginScreen } from '../screens/admin/AdminLoginScreen';
import { AdminDashboard } from '../screens/admin/AdminDashboard';
import { EnrollScreen } from '../screens/admin/EnrollScreen';
import { EnrollCameraScreen } from '../screens/admin/EnrollCameraScreen';
import { SyncStatusScreen } from '../screens/admin/SyncStatusScreen';
import { SettingsScreen } from '../screens/admin/SettingsScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade', // Fade transitions matching Stich micro-animations
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AuthCamera" component={AuthCameraScreen} />
        <Stack.Screen name="AuthResult" component={AuthResultScreen} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="Enroll" component={EnrollScreen} />
        <Stack.Screen name="EnrollCamera" component={EnrollCameraScreen} />
        <Stack.Screen name="SyncStatus" component={SyncStatusScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
