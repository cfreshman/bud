import React from 'react';
import { Text, TextStyle, TextProps } from 'react-native';

interface AppTextProps extends TextProps {
  style?: TextStyle | TextStyle[];
  children: React.ReactNode;
  bold?: boolean;
  italic?: boolean;
}

export function AppText({ style, children, bold, italic, ...props }: AppTextProps) {
  const getFontFamily = () => {
    if (bold && italic) return 'SpaceMono-BoldItalic';
    if (bold) return 'SpaceMono-Bold';
    if (italic) return 'SpaceMono-Italic';
    return 'SpaceMono';
  };

  const baseStyle: TextStyle = {
    fontFamily: getFontFamily(),
    color: '#fff',
  };

  return (
    <Text 
      style={[baseStyle, style]} 
      {...props}
    >
      {children}
    </Text>
  );
} 