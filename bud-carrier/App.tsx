import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { LoginView } from './src/components/LoginView';
import { AppText } from './src/components/AppText';
import { PlantView } from './src/components/PlantView';
import { NoPlantView } from './src/components/NoPlantView';
import { isLoggedIn, removeToken } from './src/services/auth';
import { loadPlant } from './src/services/plants';
import { PlantData } from './src/engine/types';

export default function App() {
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFontsLoaded, setIsFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [plant, setPlant] = useState<PlantData | undefined>();
  const [plotIndex, setPlotIndex] = useState<number | undefined>();

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
      try {
        const isAuthed = await isLoggedIn();
        console.log('Auth check:', { isAuthed });
        setIsAuthenticated(isAuthed);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  // Load plant when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    async function loadData() {
      console.log('Starting plant load...');
      try {
        const { plant: plantData, plotIndex: loadedPlotIndex } = await loadPlant();
        console.log('Plant loaded:', {
          hasPlant: !!plantData,
          plotIndex: loadedPlotIndex,
          roots: plantData?.roots.size,
          parts: plantData?.parts.size,
          bones: plantData?.bones.size,
          bodies: plantData?.bodies.size,
        });
        setPlant(plantData);
        setPlotIndex(loadedPlotIndex);
      } catch (error) {
        console.error('Failed to load plant:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [isAuthenticated]);

  const handleLogout = async () => {
    await removeToken();
    setIsAuthenticated(false);
    setPlant(undefined);
    setPlotIndex(undefined);
  };

  // Show loading screen during initial setup or while loading plant data
  if (!isFontsLoaded || isAuthChecking || (isAuthenticated && isLoading)) {
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
        {plant && plotIndex !== undefined ? (
          <PlantView 
            plant={plant} 
            plotIndex={plotIndex} 
            onLogout={handleLogout} 
          />
        ) : (
          <NoPlantView onLogout={handleLogout} />
        )}
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
