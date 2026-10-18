// swift-tools-version: 5.9
// The CasinoGhost engine (Rust) for Swift. Build it first with scripts/build-core-apple.sh,
// which produces CasinoGhostCoreFFI.xcframework and Sources/CasinoGhostCore/CasinoGhostCore.swift.
import PackageDescription

let package = Package(
    name: "CasinoGhostCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CasinoGhostCore", targets: ["CasinoGhostCore"]),
    ],
    targets: [
        .binaryTarget(name: "CasinoGhostCoreFFI", path: "CasinoGhostCoreFFI.xcframework"),
        .target(name: "CasinoGhostCore", dependencies: ["CasinoGhostCoreFFI"], path: "Sources/CasinoGhostCore"),
        .testTarget(name: "CasinoGhostCoreTests", dependencies: ["CasinoGhostCore"], path: "Tests/CasinoGhostCoreTests"),
    ]
)
