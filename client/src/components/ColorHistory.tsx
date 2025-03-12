import React from 'react';

interface ColorHistoryProps {
  colors: string[];
  currentColor: string;
  onSelectColor: (color: string) => void;
}

export function ColorHistory({ colors, currentColor, onSelectColor }: ColorHistoryProps) {
  const filteredColors = colors
    .filter(color => color !== currentColor)
    .filter((color, index, self) => self.indexOf(color) === index)
    .slice(-12)
    .reverse();

  if (filteredColors.length === 0) return null;

  return (
    <div className="color-history">
      {filteredColors.map((color, i) => (
        <button
          key={`${color}-${i}`}
          onClick={() => onSelectColor(color)}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
} 