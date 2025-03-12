#!/bin/bash

# Exit on error
set -e

# Setup Android SDK environment
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$PATH"

echo "Launching Android emulator for bud..."

# Check if Android SDK exists
if [ ! -d "$ANDROID_HOME" ]; then
  echo "Error: Android SDK not found at $ANDROID_HOME"
  echo "Please install Android Studio and set up the SDK first."
  exit 1
fi

# Check if emulator exists
if [ ! -f "$ANDROID_HOME/emulator/emulator" ]; then
  echo "Error: Android emulator not found at $ANDROID_HOME/emulator/emulator"
  echo "Please install the Android Emulator package in Android Studio."
  exit 1
fi

# List available emulators, filtering out INFO/ERROR lines
emulators=$("$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null | grep -v "^INFO" | grep -v "^ERROR")

if [ -z "$emulators" ]; then
  echo "No emulators found. Please create one first using Android Studio:"
  echo "1. Open Android Studio"
  echo "2. Go to Tools -> Device Manager"
  echo "3. Click Create Device"
  echo "4. Recommended: Pixel 6 Pro with Android API 33 or higher"
  exit 1
fi

# Get first emulator
first_emulator=$(echo "$emulators" | head -n1)

echo "Starting emulator: $first_emulator"

# Launch emulator in background with optimized settings for bud
# -no-snapshot-load: Don't load any snapshots
# -no-snapshot-save: Don't save snapshots
# -no-boot-anim: Skip boot animation
# -gpu host: Use host GPU for better performance
# -camera-back none: Disable back camera since we don't use it
# -camera-front none: Disable front camera since we don't use it
"$ANDROID_HOME/emulator/emulator" \
  -avd "$first_emulator" \
  -no-snapshot-load \
  -no-snapshot-save \
  -no-boot-anim \
  -gpu host \
  -camera-back none \
  -camera-front none \
  > /dev/null 2>&1 &

echo "Emulator launching in background. Wait a minute for it to fully start."
echo "Once ready, run 'npm start' in the bud-carrier directory to launch the app." 