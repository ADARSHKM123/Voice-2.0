import { StyleSheet } from 'react-native';

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0e1f6cff',
  },
  text: {
    fontSize: 14,
    color: '#000',
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: 14,
    marginTop: 20,
    // color: '#0e1f6cff',
    color: '#f6f6f6ff',
    display: 'flex',
    alignItems:"flex-start",
    justifyContent:"flex-start",
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  button: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export const colors = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  info: '#5AC8FA',
  light: '#F2F2F7',
  dark: '#000',
  white: '#fff',
  black: '#000',
  gray: '#8E8E93',
  text: {
    primary: '#000',
    secondary: '#333',
    light: '#666',
  },
  background: {
    primary: '#fff',
    secondary: '#F2F2F7',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999,
};

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
};
