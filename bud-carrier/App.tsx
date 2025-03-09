import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { LoginView } from './src/components/LoginView';
import { AppText } from './src/components/AppText';
import { isLoggedIn } from './src/services/auth';

export default function App() {
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFontsLoaded, setIsFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  // Load fonts
  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'SpaceMono': require('./assets/fonts/SpaceMono-Regular.ttf'),
          'SpaceMono-Bold': require('./assets/fonts/SpaceMono-Bold.ttf'),
          'SpaceMono-Italic': require('./assets/fonts/SpaceMono-Italic.ttf'),
          'SpaceMono-BoldItalic': require('./assets/fonts/SpaceMono-BoldItalic.ttf'),
        });
        setIsFontsLoaded(true);
      } catch (error) {
        setFontError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
    loadFonts();
  }, []);

  // Check auth state on mount
  useEffect(() => {
    async function checkAuth() {
      setIsAuthChecking(true);
      setIsAuthenticated(await isLoggedIn());
      setIsAuthChecking(false);
    }
    checkAuth();
  }, []);

  if (!isFontsLoaded || isAuthChecking) {
    return <LoadingScreen />;
  }

  if (fontError) {
    return (
      <SafeAreaView style={styles.container}>
        <AppText style={styles.error}>Font Error: {fontError}</AppText>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <AppText style={styles.text}>bud 🌱</AppText>
      </View>
    </SafeAreaProvider>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <AppText style={styles.text}>bud 🌱 loading</AppText>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111419',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
  },
  error: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
    padding: 20,
  },
});
