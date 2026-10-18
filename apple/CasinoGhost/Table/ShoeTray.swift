import SwiftUI

/// The dealing shoe, drawn in perspective: a red acrylic box whose card stack shrinks as the
/// shoe is dealt, with the cut card in place and the next card's back showing at the mouth.
struct ShoeView: View {
    /// Cards still in the shoe, shoe size, and how many are dealt before the cut card.
    let left: Int
    let size: Int
    let cut: Int
    let decks: Int
    var showNumbers = true

    // Geometry in a 230 x 124 design space (matches the web version).
    private static let vw: CGFloat = 230, vh: CGFloat = 124
    private static let x0: CGFloat = 50, yb: CGFloat = 110, l: CGFloat = 136, h: CGFloat = 58
    private static let dx: CGFloat = 30, dy: CGFloat = -24, ramp: CGFloat = 36
    private static let lmax: CGFloat = l - 30

    /// The shoe's mouth in its own unit square (0...1), where cards come out.
    static let mouth = CGPoint(x: (x0 - 8) / vw, y: (yb - h / 2 + dy / 2) / vh)

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Canvas { ctx, sz in
                let s = min(sz.width / Self.vw, sz.height / Self.vh)
                ctx.scaleBy(x: s, y: s)
                draw(&ctx)
            }
            .aspectRatio(Self.vw / Self.vh, contentMode: .fit)
            if showNumbers {
                Text(String(format: "%.1f of %d decks", Double(left) / 52, decks))
                    .font(.display(13, weight: .bold))
                    .foregroundStyle(Theme.ink.opacity(0.9))
                    .contentTransition(.numericText())
            }
        }
        .accessibilityElement()
        .accessibilityLabel(String(format: "Shoe, %.1f decks left", Double(left) / 52))
    }

    private func poly(_ pts: [CGPoint]) -> Path {
        var p = Path()
        p.addLines(pts)
        p.closeSubpath()
        return p
    }

    private func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

    /// Band on the side face, parallel to the ramp, between offsets a and b from the front.
    private func sideBand(_ a: CGFloat, _ b: CGFloat, inset: CGFloat = 2) -> [CGPoint] {
        let x = Self.x0 - Self.ramp + 6
        return [pt(x + a, Self.yb - inset), pt(x + b, Self.yb - inset), pt(x + b + Self.ramp, Self.yb - Self.h + inset), pt(x + a + Self.ramp, Self.yb - Self.h + inset)]
    }

    /// Same band on the top face.
    private func topBand(_ a: CGFloat, _ b: CGFloat) -> [CGPoint] {
        let x = Self.x0 + 6
        let y = Self.yb - Self.h
        return [pt(x + a, y), pt(x + b, y), pt(x + b + Self.dx, y + Self.dy), pt(x + a + Self.dx, y + Self.dy)]
    }

    private func draw(_ ctx: inout GraphicsContext) {
        let X0 = Self.x0, YB = Self.yb, L = Self.l, H = Self.h, DX = Self.dx, DY = Self.dy, R = Self.ramp
        let len = size > 0 ? max(0, CGFloat(left) / CGFloat(size) * Self.lmax) : 0
        let dealt = size - left
        let cutFromFront = size > 0 ? max(0, CGFloat(cut - dealt) / CGFloat(size) * Self.lmax) : 0
        let s0: CGFloat = 3, s1 = s0 + len

        // shadow on the felt
        ctx.fill(Path(ellipseIn: CGRect(x: X0 + L / 2 + 6 - (L / 2 + 30), y: YB + 5 - 9, width: L + 60, height: 18)),
                 with: .radialGradient(Gradient(colors: [.black.opacity(0.45), .clear]), center: pt(X0 + L / 2 + 6, YB + 5), startRadius: 0, endRadius: L / 2 + 30))
        // back face
        ctx.fill(poly([pt(X0 + L, YB), pt(X0 + L + DX, YB + DY), pt(X0 + L + DX, YB - H + DY), pt(X0 + L, YB - H)]), with: .color(Color(hex: 0x5E0A12, opacity: 0.85)))

        // the cards: white edges with fine lines
        if len > 0 {
            let top = poly(topBand(s0, s1))
            ctx.fill(top, with: .color(.white))
            let side = poly(sideBand(s0, s1))
            ctx.fill(side, with: .color(Color(hex: 0xFDFBF5)))
            var lines = Path()
            var a = s0
            while a < s1 {
                let b = sideBand(a, a)
                lines.move(to: b[0]); lines.addLine(to: b[3])
                let t = topBand(a, a)
                lines.move(to: t[0]); lines.addLine(to: t[3])
                a += 2.4
            }
            ctx.stroke(lines, with: .color(Color(hex: 0xD2CAB6)), lineWidth: 0.5)
        }
        // the weight pushing the cards forward
        ctx.fill(poly(topBand(s1, s1 + 13)), with: .color(Color(hex: 0x2A2A2E)))
        ctx.fill(poly(sideBand(s1, s1 + 13, inset: 1)), with: .color(Color(hex: 0x1B1B1F)))
        // the cut card
        if left > 0 {
            let c = s0 + min(cutFromFront, len)
            ctx.fill(poly(sideBand(c, c + 1.6, inset: -4)), with: .color(Color(hex: 0xFFD23F)))
            ctx.fill(poly(topBand(c, c + 1.6)), with: .color(Color(hex: 0xFFE27A)))
        }

        // acrylic body
        let sideFace = poly([pt(X0 - R, YB), pt(X0 + L, YB), pt(X0 + L, YB - H), pt(X0 + 6, YB - H)])
        ctx.fill(sideFace, with: .linearGradient(Gradient(stops: [
            .init(color: Color(hex: 0xFF4D58, opacity: 0.14), location: 0),
            .init(color: Color(hex: 0xC01C28, opacity: 0.32), location: 0.8),
            .init(color: Color(hex: 0x7A0D16, opacity: 0.6), location: 1),
        ]), startPoint: pt(0, YB - H), endPoint: pt(0, YB)))
        ctx.fill(poly([pt(X0 + 6, YB - H), pt(X0 + L, YB - H), pt(X0 + L + DX, YB - H + DY), pt(X0 + 6 + DX, YB - H + DY)]),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0xFFB3B8, opacity: 0.22), Color(hex: 0xE0303C, opacity: 0.1), Color(hex: 0xFFC9CC, opacity: 0.28)]),
                                       startPoint: pt(X0, YB - H + DY), endPoint: pt(X0 + L + DX, YB - H)))
        // the mouth: sloped plate with the next card's back
        ctx.fill(poly([pt(X0 - R, YB), pt(X0 + 6, YB - H), pt(X0 + 6 + DX, YB - H + DY), pt(X0 - R + DX, YB + DY)]),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0x5C0A12), Color(hex: 0xB51D28)]), startPoint: pt(X0 - R, YB), endPoint: pt(X0 + 6 + DX, YB - H + DY)))
        if left > 0 {
            let back = poly([pt(X0 - R + 9, YB - 4), pt(X0 + 3, YB - H + 5), pt(X0 + 3 + DX - 6, YB - H + DY + 5), pt(X0 - R + 9 + DX - 6, YB + DY - 4)])
            ctx.fill(back, with: .color(Color(hex: 0x6B1622)))
            var lattice = Path()
            for i in stride(from: -60.0, through: 60.0, by: 6.0) {
                lattice.move(to: pt(X0 - R + 9 + i, YB))
                lattice.addLine(to: pt(X0 + 40 + i, YB - H - 10))
                lattice.move(to: pt(X0 - R + 9 + i, YB - H))
                lattice.addLine(to: pt(X0 + 40 + i, YB + 10))
            }
            var clipped = ctx
            clipped.clip(to: back)
            clipped.stroke(lattice, with: .color(Color(hex: 0xD9B56A, opacity: 0.55)), lineWidth: 0.7)
            ctx.stroke(back, with: .color(Color(hex: 0xF4EFE2)), lineWidth: 1.4)
        }
        var slot = Path()
        slot.move(to: pt(X0 - R + 4 + DX * 0.35, YB + DY * 0.35 - 1))
        slot.addQuadCurve(to: pt(X0 - R + 24 + DX * 0.35, YB + DY * 0.35 - 1), control: pt(X0 - R + 14 + DX * 0.35, YB + DY * 0.35 - 10))
        ctx.fill(slot, with: .color(Color(hex: 0x2B0307, opacity: 0.9)))

        // base, outlines and highlights
        ctx.fill(poly([pt(X0 - R, YB), pt(X0 + L, YB), pt(X0 + L, YB - 6), pt(X0 - R + 4.1, YB - 6)]), with: .color(Color(hex: 0x8E111C, opacity: 0.92)))
        ctx.stroke(sideFace, with: .color(Color(hex: 0xFFC2C6, opacity: 0.55)), lineWidth: 1)
        let end = poly([pt(X0 + L, YB), pt(X0 + L + DX, YB + DY), pt(X0 + L + DX, YB - H + DY), pt(X0 + L, YB - H)])
        ctx.fill(end, with: .color(Color(hex: 0xA3141F, opacity: 0.45)))
        ctx.stroke(end, with: .color(Color(hex: 0xFFC2C6, opacity: 0.4)), lineWidth: 1)
        var hl = Path()
        hl.move(to: pt(X0 + 6, YB - H)); hl.addLine(to: pt(X0 + L, YB - H)); hl.addLine(to: pt(X0 + L + DX, YB - H + DY))
        ctx.stroke(hl, with: .color(Color(hex: 0xFFD3D6, opacity: 0.55)), lineWidth: 1.2)
        var edge = Path()
        edge.move(to: pt(X0 - R, YB)); edge.addLine(to: pt(X0 + 6, YB - H))
        ctx.stroke(edge, with: .color(Color(hex: 0xFFB3B8, opacity: 0.5)), lineWidth: 1)
    }
}

/// The discard tray: a clear box where played cards pile up to scale, with deck marks.
struct TrayView: View {
    let inTray: Int
    let size: Int
    let decks: Int
    var marks = true

    private static let tw: CGFloat = 92, th: CGFloat = 132
    private static let bx: CGFloat = 12, by: CGFloat = 120, bw: CGFloat = 54, bh: CGFloat = 96, tdx: CGFloat = 18, tdy: CGFloat = -14

    /// Where cards are swept to, in the tray's unit square.
    static let mouth = CGPoint(x: (bx + bw / 2 + tdx / 2) / tw, y: (by - bh * 0.6) / th)

    var body: some View {
        Canvas { ctx, sz in
            let s = min(sz.width / Self.tw, sz.height / Self.th)
            ctx.scaleBy(x: s, y: s)
            draw(&ctx)
        }
        .aspectRatio(Self.tw / Self.th, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel(String(format: "Discard tray, %.1f decks played", Double(inTray) / 52))
    }

    private func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }
    private func poly(_ pts: [CGPoint]) -> Path {
        var p = Path()
        p.addLines(pts)
        p.closeSubpath()
        return p
    }

    private func draw(_ ctx: inout GraphicsContext) {
        let BX = Self.bx, BY = Self.by, BW = Self.bw, BH = Self.bh, TDX = Self.tdx, TDY = Self.tdy
        let h = size > 0 ? CGFloat(inTray) / CGFloat(size) * (BH - 6) : 0
        let top = BY - 3 - h
        ctx.fill(Path(ellipseIn: CGRect(x: BX + BW / 2 + 8 - (BW / 2 + 18), y: BY + 4 - 6, width: BW + 36, height: 12)),
                 with: .radialGradient(Gradient(colors: [.black.opacity(0.4), .clear]), center: pt(BX + BW / 2 + 8, BY + 4), startRadius: 0, endRadius: BW / 2 + 18))
        // back wall
        let back = poly([pt(BX + TDX, BY + TDY), pt(BX + BW + TDX, BY + TDY), pt(BX + BW + TDX, BY - BH + TDY), pt(BX + TDX, BY - BH + TDY)])
        ctx.fill(back, with: .color(.white.opacity(0.05)))
        ctx.stroke(back, with: .color(.white.opacity(0.25)), lineWidth: 1)
        // the pile
        if h > 0.5 {
            ctx.fill(poly([pt(BX + BW, BY - 3), pt(BX + BW + TDX - 3, BY + TDY), pt(BX + BW + TDX - 3, top + TDY + 3), pt(BX + BW, top)]), with: .color(Color(hex: 0xD9D2C0)))
            let front = CGRect(x: BX + 3, y: top, width: BW - 3, height: h)
            ctx.fill(Path(front), with: .color(Color(hex: 0xF7F3E8)))
            var lines = Path()
            var y = top + 1.6
            while y < top + h {
                lines.move(to: pt(BX + 3, y)); lines.addLine(to: pt(BX + BW, y))
                y += 2.4
            }
            ctx.stroke(lines, with: .color(Color(hex: 0xBDB5A1)), lineWidth: 0.8)
            let lid = poly([pt(BX + 3, top), pt(BX + BW, top), pt(BX + BW + TDX - 3, top + TDY + 3), pt(BX + 3 + TDX - 3, top + TDY + 3)])
            ctx.fill(lid, with: .color(Color(hex: 0x6B1622)))
            ctx.stroke(lid, with: .color(Color(hex: 0xF4EFE2)), lineWidth: 1)
        }
        // glass
        let glass = GraphicsContext.Shading.linearGradient(Gradient(stops: [
            .init(color: .white.opacity(0.22), location: 0), .init(color: .white.opacity(0.06), location: 0.6), .init(color: .white.opacity(0.14), location: 1),
        ]), startPoint: pt(BX, BY - BH), endPoint: pt(BX + BW, BY))
        let right = poly([pt(BX + BW, BY), pt(BX + BW + TDX, BY + TDY), pt(BX + BW + TDX, BY - BH + TDY), pt(BX + BW, BY - BH)])
        ctx.fill(right, with: glass)
        ctx.stroke(right, with: .color(.white.opacity(0.4)), lineWidth: 1)
        let frontGlass = Path(roundedRect: CGRect(x: BX, y: BY - BH, width: BW, height: BH), cornerRadius: 2)
        ctx.fill(frontGlass, with: glass)
        ctx.stroke(frontGlass, with: .color(.white.opacity(0.55)), lineWidth: 1)
        var rim = Path()
        rim.move(to: pt(BX, BY - BH)); rim.addLine(to: pt(BX + TDX, BY - BH + TDY)); rim.addLine(to: pt(BX + BW + TDX, BY - BH + TDY)); rim.addLine(to: pt(BX + BW, BY - BH))
        ctx.stroke(rim, with: .color(.white.opacity(0.5)), lineWidth: 1)
        if marks && decks > 1 {
            for i in 1..<decks {
                let y = BY - 3 - CGFloat(i) / CGFloat(decks) * (BH - 6)
                var m = Path()
                m.move(to: pt(BX, y)); m.addLine(to: pt(BX + 7, y))
                ctx.stroke(m, with: .color(.white.opacity(0.7)), lineWidth: 1.2)
                ctx.draw(Text("\(i)").font(.system(size: 8, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.65)), at: pt(BX + 12, y), anchor: .center)
            }
        }
    }
}
