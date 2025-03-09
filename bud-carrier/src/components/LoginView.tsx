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
      <AppText style={styles.title}>bud 🌱</AppText>
      
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
        
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogin}
        >
          <AppText style={styles.buttonText}>login</AppText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111419',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    marginBottom: 40,
  },
  form: {
    width: '100%',
    maxWidth: 300,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#2a313c',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: {
    fontSize: 16,
  },
  error: {
    color: '#ff6b6b',
    marginTop: 10,
    textAlign: 'center',
  },
}); 