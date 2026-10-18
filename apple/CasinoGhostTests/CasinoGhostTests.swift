import XCTest
import CasinoGhostCore
@testable import CasinoGhost

final class CasinoGhostTests: XCTestCase {
    func testEngineLinksIntoTheApp() {
        XCTAssertEqual(houseEdge(rules: defaultRules()), 0.0040, accuracy: 0.0002)
    }
}
