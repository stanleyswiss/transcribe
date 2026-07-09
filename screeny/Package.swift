// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "screeny",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Screeny", targets: ["ScreenyApp"])
    ],
    targets: [
        .executableTarget(name: "ScreenyApp"),
        .testTarget(name: "ScreenyAppTests", dependencies: ["ScreenyApp"])
    ]
)
