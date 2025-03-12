#!/bin/bash

# Exit on error
set -e

# Setup Android SDK environment
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$PATH"

# Check if Android SDK exists
if [ ! -d "$ANDROID_HOME" ]; then
  echo "Error: Android SDK not found at $ANDROID_HOME"
  echo "Please install Android Studio and set up the SDK first."
  exit 1
fi

echo "Building Android APK for bud..."

# Move to bud-carrier directory
cd bud-carrier

# Clean if requested
if [ "$1" = "clean" ]; then
  echo "Cleaning previous build..."
  npx expo prebuild --clean
fi

# Make sure we have latest dependencies
echo "Installing dependencies..."
npm install

# Generate native Android project if needed
echo "Ensuring Android project exists..."
npx expo prebuild -p android

# Move to android directory
cd android

# Build release APK
echo "Building release APK..."
./gradlew assembleRelease

# Move back to root
cd ../..

# Ensure client/dist/android directory exists
mkdir -p client/dist/android

# Copy APK to client dist directory
cp bud-carrier/android/app/build/outputs/apk/release/app-release.apk client/public/android/bud.apk

echo "Android APK built and placed in client/dist/android/bud.apk"
echo "Note: Make sure you have configured app.json with correct package name and version" 