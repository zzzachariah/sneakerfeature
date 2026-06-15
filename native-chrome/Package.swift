// swift-tools-version: 5.9
import PackageDescription

// Capacitor 8 iOS projects integrate plugins via Swift Package Manager, so the
// plugin must ship a Package.swift (the .podspec only covers CocoaPods-based
// apps). Without this, `cap sync` warns "native-chrome does not have a
// Package.swift" and the plugin's Swift never gets compiled in.
let package = Package(
    name: "NativeChrome",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "NativeChrome",
            targets: ["NativeChromePlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "NativeChromePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/NativeChromePlugin"
        )
    ]
)
