import Foundation

enum Fmt {
    private static let whole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        return f
    }()
    private static let cents: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    /// $1,250 or $787.50.
    static func money(_ x: Double) -> String {
        let f = x.rounded() == x ? whole : cents
        return f.string(from: NSNumber(value: x)) ?? "$\(x)"
    }

    /// +$12.50 / −$3.
    static func signedMoney(_ x: Double) -> String {
        if x == 0 { return money(0) }
        return (x > 0 ? "+" : "−") + money(abs(x))
    }

    /// A fraction as a percentage: 0.0123 -> "+1.23%".
    static func pct(_ x: Double, digits: Int = 2, signed: Bool = true) -> String {
        let v = x * 100
        let s = String(format: "%.\(digits)f%%", abs(v))
        if !signed { return (v < 0 ? "−" : "") + s }
        if abs(v) < 0.5 * pow(10, Double(-digits)) { return String(format: "%.\(digits)f%%", 0.0) }
        return (v > 0 ? "+" : "−") + s
    }

    /// A count: "+2", "−1", "+1.5", "0".
    static func count(_ x: Double) -> String {
        let r = (x * 2).rounded() / 2
        if r == 0 { return "0" }
        let body = r.rounded() == r ? String(Int(abs(r))) : String(format: "%.1f", abs(r))
        return (r > 0 ? "+" : "−") + body
    }

    static func number(_ x: Double, digits: Int = 0) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = digits
        f.minimumFractionDigits = digits
        return f.string(from: NSNumber(value: x)) ?? String(x)
    }

    static func rounds(_ n: UInt64) -> String {
        if n >= 1_000_000_000 { return String(format: "%.1fB", Double(n) / 1e9) }
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1e6) }
        if n >= 1_000 { return String(format: "%.0fK", Double(n) / 1e3) }
        return String(n)
    }

    static func duration(ms: Double) -> String {
        let s = Int(ms / 1000)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
}
