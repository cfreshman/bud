import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

interface NoPlantViewProps {
  onLogout: () => Promise<void>;
}

export function NoPlantView({ onLogout }: NoPlantViewProps) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.logoutButtonContainer} edges={['top', 'left']}>
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={onLogout}
        >
          <AppText style={styles.logoutText}>logout</AppText>
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.content}>
        <AppText style={styles.title}>no bud carried</AppText>
        <AppText style={styles.description}>
          visit bud-ga.me on desktop{'\n'}
          to select a bud to carry
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#111419',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    color: '#ffffff',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#ffffff99',
  },
  logoutButtonContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
    padding: 16,
  },
  logoutButton: {
    backgroundColor: '#ffffff20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  logoutText: {
    fontSize: 12,
    color: '#ffffff',
  },
}); 