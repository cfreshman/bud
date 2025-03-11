#!/bin/bash
set -e

echo "Building standalone mobile app..."

# Navigate to mobile directory
cd bud-carrier

# Clean everything
rm -rf ios
rm -rf android
rm -rf .expo
rm -rf node_modules

# Fresh install
npm install

# Generate fresh native iOS project
npx expo prebuild -p ios

# Install CocoaPods dependencies
cd ios
pod install
cd ..

# Create production bundle
mkdir -p ios/assets
npx react-native bundle \
    --platform ios \
    --dev false \
    --entry-file index.ts \
    --bundle-output ios/main.jsbundle \
    --assets-dest ios/assets

echo "iOS project generated! To create production build:"
echo "1. Open bud-carrier/ios/budcarrier.xcworkspace in Xcode"
echo "2. Select 'Any iOS Device (arm64)' as the build target"
echo "3. Ensure 'Release' scheme is selected"
echo "4. Select Product > Archive to create release build" 