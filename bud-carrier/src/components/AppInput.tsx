import React from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';

interface AppInputProps extends TextInputProps {
  // Add any additional props here
}

export function AppInput({ style, ...props }: AppInputProps) {
  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor="#666"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#1a1f27',
    borderRadius: 8,
    marginBottom: 10,
    paddingHorizontal: 15,
    color: '#fff',
    fontFamily: 'SpaceMono',
  },
}); 