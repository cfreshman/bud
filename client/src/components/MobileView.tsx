import React from 'react';

export function MobileView() {
  return (
    <div className="mobile-view">
      <svg 
        className="backsplash-scene" 
        viewBox="0 0 100 100" 
        preserveAspectRatio="xMidYMid slice"
      >
        <circle 
          cx="50" 
          cy="225" 
          r="150" 
          fill="#bbddbb" 
        />
      </svg>

      <div className="mobile-content">
        <div className="message-bubble">
          <p>get the bud carrier app!</p>
          <p>available on iOS TestFlight</p>
        </div>
        <a 
          href="https://testflight.apple.com/join/ChMubZNX"
          target="_blank"
          rel="noopener noreferrer"
          className="download-button"
        >
          bud 🌱 download
        </a>
      </div>
      
    </div>
  );
} 