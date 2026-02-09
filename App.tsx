import React from 'react';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';

function AppContent(): React.JSX.Element {
  const { user } = useAuth();

  if (user) {
    return <HomeScreen />;
  }

  return <AuthScreen />;
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
