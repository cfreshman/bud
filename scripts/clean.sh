#!/bin/bash

# Clean iOS build artifacts
echo "Cleaning iOS build artifacts..."
rm -rf bud-carrier/ios/build
rm -rf bud-carrier/ios/Pods
rm -rf bud-carrier/ios/DerivedData

# Clean Expo artifacts
echo "Cleaning Expo artifacts..."
rm -rf bud-carrier/.expo
rm -rf bud-carrier/node_modules/.cache/expo

# Clean Metro bundler cache
echo "Cleaning Metro bundler cache..."
rm -rf bud-carrier/node_modules/.cache/metro
rm -rf bud-carrier/node_modules/.cache/babel-loader

echo "Clean complete! Now you can rebuild the app." 