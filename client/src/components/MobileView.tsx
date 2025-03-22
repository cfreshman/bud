import React from 'react';

interface MobileViewProps {
  sharedBudClaimed?: boolean;
  onLogout: () => void;
  username: string;
  receivedPlot?: number | null;
  onCarryBud?: (plotIndex: number) => void;
}

export function MobileView({ sharedBudClaimed, onLogout, username, receivedPlot, onCarryBud }: MobileViewProps) {
  return (
    <div className="mobile-view">
      <div className="circle" />

      <div className="mobile-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {sharedBudClaimed && (
          <>
            <div className="mobile-message">
              <p>you claimed a bud!</p>
              {receivedPlot !== undefined && receivedPlot !== null && onCarryBud && (
                <p>take it with you in the bud carrier app</p>
              )}
            </div>
            {receivedPlot !== undefined && receivedPlot !== null && onCarryBud && (
              <div className="download-buttons">
                <button 
                  className="download-button"
                  onClick={() => onCarryBud(receivedPlot)}
                >
                  add to bud carrier 🌱
                </button>
              </div>
            )}
          </>
        )}

        <div className="mobile-message">
          <p>looking to manage your buds?</p>
          <p>open this page on desktop!</p>
          <p>gift links do work here but managing your buds requires a mouse</p>
        </div>
        <div className="download-buttons">
          <button 
            className="download-button"
            onClick={onLogout}
          >
            log out {username}
          </button>
        </div>

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
      </div>
    </div>
  );
} 