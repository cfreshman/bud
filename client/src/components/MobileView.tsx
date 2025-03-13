import React from 'react';

interface MobileViewProps {
  sharedBudClaimed?: boolean;
  onLogout: () => void;
  username: string;
}

export function MobileView({ sharedBudClaimed, onLogout, username }: MobileViewProps) {
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

      <div className="mobile-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="download-buttons">
          <button 
            className="download-button"
            onClick={onLogout}
          >
            log out {username}
          </button>
        </div>

        {sharedBudClaimed && (
          <div className="mobile-message">
            <p>you claimed a bud!</p>
          </div>
        )}
        <div className="mobile-message">
          <p>get the bud carrier app!</p>
          <p>available with iOS TestFlight and Android APK</p>
        </div>
        <div className="download-buttons">
          <a 
            href="https://testflight.apple.com/join/ChMubZNX"
            target="_blank"
            rel="noopener noreferrer"
            className="download-button"
          >
            bud 🌱 iOS
          </a>
          <a 
            href="/android/bud.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="download-button"
          >
            bud 🌱 Android
          </a>
        </div>
        <div className="mobile-message">
          <p>looking to manage your buds?</p>
          <p>open this page on desktop!</p>
        </div>
      </div>
    </div>
  );
} 