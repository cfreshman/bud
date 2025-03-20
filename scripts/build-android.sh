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

# Check for release keystore
if [ ! -f "bud-carrier/android/app/release.keystore" ]; then
  echo "Error: Release keystore not found at bud-carrier/android/app/release.keystore"
  echo "Generating release keystore..."
  
  # Generate release keystore
  keytool -genkeypair \
    -v \
    -keystore bud-carrier/android/app/release.keystore \
    -alias release \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass budrelease \
    -keypass budrelease \
    -dname "CN=Freshman, O=Freshman Dev, L=San Francisco, ST=California, C=US"
fi

echo "Building Android packages for bud..."

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

# Configure release signing in gradle properties
echo "Configuring release signing..."
cat > android/gradle.properties << EOF
# Project-wide Gradle settings
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
android.enableJetifier=true
hermesEnabled=true

# Release keystore config
RELEASE_STORE_FILE=release.keystore
RELEASE_KEY_ALIAS=release
RELEASE_STORE_PASSWORD=budrelease
RELEASE_KEY_PASSWORD=budrelease
EOF

# Move to android directory
cd android

# Build release APK
echo "Building release APK..."
./gradlew assembleRelease

# Build release AAB
echo "Building release AAB..."
./gradlew bundleRelease

# Move back to root
cd ../..

# Ensure directories exist
mkdir -p client/public/android
mkdir -p client/dist/android

# Copy APK and AAB to client dist directory
cp bud-carrier/android/app/build/outputs/apk/release/app-release.apk client/public/android/bud.apk
cp bud-carrier/android/app/build/outputs/bundle/release/app-release.aab client/public/android/bud.aab

echo "Android builds complete!"
echo "Note: Make sure you have configured app.json with correct package name and version" 