import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login, setToken } from '../services/auth';
import { AppText } from './AppText';
import { AppInput } from './AppInput';

interface LoginViewProps {
  onLogin: () => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      setError('');
      const response = await login(username, password);
      await setToken(response.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.circle} />
      
      <View style={styles.content}>
        <View style={styles.form}>
          <AppInput
            placeholder="username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
          />
          
          <AppInput
            placeholder="password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
          
          <TouchableOpacity 
            style={styles.button}
            onPress={handleLogin}
          >
            <AppText style={styles.buttonText}>{error ? error : 'login'}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#88aa99',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    width: 1200,
    height: 1200,
    borderRadius: 600,
    backgroundColor: '#bbddbb',
    top: '50%',
    marginTop: 225,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    zIndex: 1,
  },
  messageBubble: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  title: {
    fontSize: 14,
    color: '#000000',
  },
  form: {
    width: '100%',
    maxWidth: 300,
  },
  button: {
    width: '100%',
    height: 40,
    backgroundColor: '#fdfdfd',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: {
    fontSize: 14,
    color: '#000000',
  },
  error: {
    color: '#ff4444',
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    opacity: 0.6,
  },
}); 