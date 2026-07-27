// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "FoodDiscovery",
    platforms: [
        .iOS(.v17),
        .macOS(.v13),
    ],
    products: [
        .library(name: "DiscoveryCore", targets: ["DiscoveryCore"]),
    ],
    targets: [
        .target(name: "DiscoveryCore"),
        .testTarget(
            name: "DiscoveryCoreTests",
            dependencies: ["DiscoveryCore"]
        ),
    ]
)
