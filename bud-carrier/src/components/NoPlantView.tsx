import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText } from './AppText';

interface NoPlantViewProps {
  onLogout: () => Promise<void>;
}

export function NoPlantView({ onLogout }: NoPlantViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <AppText style={styles.title}>no bud carried</AppText>
        <AppText style={styles.description}>
          visit bud-ga.me on desktop{'\n'}
          to select a bud to carry
        </AppText>
      </View>
      
      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={onLogout}
      >
        <AppText style={styles.logoutText}>logout</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111419',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#8899aa',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#1a1f26',
  },
  logoutText: {
    fontSize: 16,
    color: '#8899aa',
  },
}); 