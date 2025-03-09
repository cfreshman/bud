import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>bud 🌱</Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={styles.container}>
      <LoadingScreen />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    fontSize: 18,
    letterSpacing: 1,
    color: '#fdfdfd',
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#fdfdfd',
    borderRadius: 99,
    paddingVertical: 2,
    paddingHorizontal: 12,
  },
});
