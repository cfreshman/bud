#!/bin/bash
set -e

echo "Building standalone mobile app..."
echo "Note: If you need to clean build artifacts first, run ./scripts/clean.sh"

# Navigate to mobile directory
cd bud-carrier

# Install dependencies
npm install

# Generate native iOS project
npx expo prebuild -p ios --no-install

# Install CocoaPods dependencies
cd ios
pod install
cd ..

# Build iOS project
npx expo run:ios --no-install

echo "iOS project generated! To create production build:"
echo "1. Open bud-carrier/ios/budcarrier.xcworkspace in Xcode"
echo "2. Select 'Any iOS Device (arm64)' as the build target"
echo "3. Ensure 'Release' scheme is selected"
echo "4. Select Product > Archive to create release build" 