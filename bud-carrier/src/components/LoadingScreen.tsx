import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from './AppText';

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <AppText style={styles.text}>bud 🌱 loading</AppText>
    </View>
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
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 99,
    paddingVertical: 2,
    paddingHorizontal: 18,
  },
}); 