#!/bin/bash
set -e

echo "Building standalone mobile app..."

# Navigate to mobile directory
cd bud-carrier

# Install
npm install

# Generate fresh native iOS project
npx expo prebuild -p ios

# Install CocoaPods dependencies
cd ios
pod install
cd ..

echo "iOS project generated! To create production build:"
echo "1. Open bud-carrier/ios/budcarrier.xcworkspace in Xcode"
echo "2. Select 'Any iOS Device (arm64)' as the build target"
echo "3. Ensure 'Release' scheme is selected"
echo "4. Select Product > Archive to create release build" 