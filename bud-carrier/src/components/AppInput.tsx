import React from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';

interface AppInputProps extends TextInputProps {
  // Add any additional props here
}

export function AppInput({ style, ...props }: AppInputProps) {
  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor="#00000099"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
    height: 40,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    color: '#000000',
    fontFamily: 'SpaceMono',
    fontSize: 14,
  },
}); 