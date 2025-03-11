#!/bin/bash

# Check if icon.png exists
if [ ! -f "icon.png" ]; then
  echo "Error: icon.png not found"
  exit 1
fi

# Create necessary directories
mkdir -p bud-carrier/assets
mkdir -p client/public

# iOS/Expo main icons
convert icon.png -resize 1024x1024 bud-carrier/assets/icon.png
convert icon.png -resize 1024x1024 bud-carrier/assets/adaptive-icon.png

# iOS app icon sizes
mkdir -p bud-carrier/ios/budcarrier/Images.xcassets/AppIcon.appiconset

# Format: size:scale
ICON_SIZES=(
  "20:2" "20:3"     # iPhone notification 2x, 3x (40px, 60px)
  "29:2" "29:3"     # iPhone settings 2x, 3x (58px, 87px)
  "40:2" "40:3"     # iPhone spotlight 2x, 3x (80px, 120px)
  "60:2" "60:3"     # iPhone app 2x, 3x (120px, 180px)
  "20:1" "20:2"     # iPad notification 1x, 2x (20px, 40px)
  "29:1" "29:2"     # iPad settings 1x, 2x (29px, 58px)
  "40:1" "40:2"     # iPad spotlight 1x, 2x (40px, 80px)
  "76:1" "76:2"     # iPad app 1x, 2x (76px, 152px)
  "83.5:2"          # iPad Pro app 2x (167px)
  "1024:1"          # App Store (1024px)
)

for size_scale in "${ICON_SIZES[@]}"; do
  size=${size_scale%:*}
  scale=${size_scale#*:}
  pixel_size=$(echo "$size * $scale" | bc)
  pixel_size=${pixel_size%.*} # Remove decimal if any
  convert icon.png -resize ${pixel_size}x${pixel_size} bud-carrier/ios/budcarrier/Images.xcassets/AppIcon.appiconset/icon_${pixel_size}.png
done

# Generate Contents.json for AppIcon
cat > bud-carrier/ios/budcarrier/Images.xcassets/AppIcon.appiconset/Contents.json << EOL
{
  "images": [
    {
      "filename": "icon_40.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "20x20"
    },
    {
      "filename": "icon_60.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "20x20"
    },
    {
      "filename": "icon_58.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "29x29"
    },
    {
      "filename": "icon_87.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "29x29"
    },
    {
      "filename": "icon_80.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "40x40"
    },
    {
      "filename": "icon_120.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "40x40"
    },
    {
      "filename": "icon_120.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "60x60"
    },
    {
      "filename": "icon_180.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "60x60"
    },
    {
      "filename": "icon_20.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "20x20"
    },
    {
      "filename": "icon_40.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "20x20"
    },
    {
      "filename": "icon_29.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "29x29"
    },
    {
      "filename": "icon_58.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "29x29"
    },
    {
      "filename": "icon_40.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "40x40"
    },
    {
      "filename": "icon_80.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "40x40"
    },
    {
      "filename": "icon_76.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "76x76"
    },
    {
      "filename": "icon_152.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "76x76"
    },
    {
      "filename": "icon_167.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "83.5x83.5"
    },
    {
      "filename": "icon_1024.png",
      "idiom": "ios-marketing",
      "scale": "1x",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
EOL

# iOS splash screen logo
mkdir -p bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenLogo.imageset
convert icon.png -resize 200x200 bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenLogo.imageset/image.png
convert icon.png -resize 400x400 bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenLogo.imageset/image@2x.png
convert icon.png -resize 600x600 bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenLogo.imageset/image@3x.png

# iOS splash screen background color
mkdir -p bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenBackground.colorset
cat > bud-carrier/ios/budcarrier/Images.xcassets/SplashScreenBackground.colorset/Contents.json << EOL
{
  "colors": [
    {
      "color": {
        "color-space": "srgb",
        "components": {
          "alpha": "1.000",
          "red": "0.533",
          "green": "0.667",
          "blue": "0.600"
        }
      },
      "idiom": "universal"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
EOL

# Expo splash screen
convert icon.png -resize 1024x1024 \
  -background '#88aa99' -gravity center \
  -extent 1242x2436 \
  bud-carrier/assets/splash-icon.png

# Web icons
convert icon.png -resize 192x192 client/public/icon-192.png
convert icon.png -resize 512x512 client/public/icon-512.png
convert icon.png -resize 32x32 client/public/favicon.png

echo "Icons generated successfully!" 