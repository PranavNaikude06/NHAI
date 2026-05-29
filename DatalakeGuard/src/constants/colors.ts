// src/constants/colors.ts

export const Colors = {
  primary: '#1A73E8',         // Action blue / primary buttons
  success: '#34A853',         // Auth success green
  danger: '#EA4335',          // Rejection / spoof fail red
  warning: '#FBBC04',         // Liveness progress yellow
  background: '#131313',      // Deep base background
  surface: '#1E1E1E',         // Level 1 card surface
  surfaceDim: '#131313',
  surfaceBright: '#3A3939',
  surfaceContainerLowest: '#0E0E0E',
  surfaceContainerLow: '#1C1B1B',
  surfaceContainer: '#201F1F',
  surfaceContainerHigh: '#2A2A2A',
  surfaceContainerHighest: '#353534',
  onSurface: '#E5E2E1',
  onSurfaceVariant: '#C1C6D6',
  inverseSurface: '#E5E2E1',
  inverseOnSurface: '#313030',
  outline: '#8B909F',
  outlineVariant: '#414754',
  text: '#FFFFFF',
  textSecondary: '#9AA0A6',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const Typography = {
  headlineXl: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
    letterSpacing: 0,
  },
  headlineLg: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    letterSpacing: 0,
  },
  headlineLgMobile: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 28,
  },
  titleMd: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  bodyLg: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodyMd: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  labelMd: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    letterSpacing: 0.6, // 0.05em
  },
  resultName: {
    fontSize: 28,
    fontWeight: '800' as const,
    lineHeight: 34,
    letterSpacing: 0,
  },
  resultRole: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
    letterSpacing: 1.2,
  },
  monoData: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    fontFamily: 'Courier', // Standard fallback cross-platform monospace
  },
};
