// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "IOSRender",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "PeachEngine", path: "PeachEngine"),
        .executableTarget(name: "Render", dependencies: ["PeachEngine"], path: "Render",
                          swiftSettings: [.swiftLanguageMode(.v5)]),
    ]
)
