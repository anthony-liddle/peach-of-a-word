// The confetti's glyphs as outlines, read from the fonts the iPhone app draws
// them in, for `capture-store-motion.ts`. Never committed as data: they're
// read from this Mac's own fonts each time the store art is captured.
//
//     echo '[{"key": "heart:13.8", "glyph": "♥", "points": 13.8}]' | swift scripts/glyph-outlines.swift
//
// Prints `{"heart:13.8": "M… Z"}`: each glyph's outline as SVG path data, in
// a box `points` across, placed as SwiftUI places `Text(glyph)` in a frame
// that size (`Confetti.swift`): its advance centred across, and the system
// font's line centred down, the glyph on that line's baseline.
//
// **The fonts are SwiftUI's:** the system font at that size, as
// `.font(.system(size:))` asks for, and whatever font CoreText falls back on
// for a glyph the system font lacks: Zapf Dingbats for the sparkle, on iOS
// as on a Mac.
import CoreText
import Foundation

struct Wanted: Decodable {
    let key: String
    let glyph: String
    let points: Double
}

let wanted = try JSONDecoder().decode(
    [Wanted].self, from: FileHandle.standardInput.readDataToEndOfFile())
var outlines: [String: String] = [:]

for w in wanted {
    let size = CGFloat(w.points)
    guard let system = CTFontCreateUIFontForLanguage(.system, size, nil) else {
        fatalError("No system font at \(size) points.")
    }
    var chars = Array(w.glyph.utf16)
    let font = CTFontCreateForString(
        system, w.glyph as CFString, CFRange(location: 0, length: chars.count))
    var glyphs = [CGGlyph](repeating: 0, count: chars.count)
    guard CTFontGetGlyphsForCharacters(font, &chars, &glyphs, chars.count),
          let path = CTFontCreatePathForGlyph(font, glyphs[0], nil) else {
        fatalError("No outline for \(w.glyph) in \(CTFontCopyPostScriptName(font)).")
    }
    var advance = CGSize.zero
    CTFontGetAdvancesForGlyphs(font, .horizontal, &glyphs, &advance, 1)
    // The line is the system font's, with any leading split above and below.
    let ascent = CTFontGetAscent(system)
    let descent = CTFontGetDescent(system)
    let leading = CTFontGetLeading(system)
    let left = (size - advance.width) / 2
    let baseline = (size - (ascent + descent + leading)) / 2 + leading / 2 + ascent

    func at(_ p: CGPoint) -> String {
        String(format: "%.3f %.3f", left + p.x, baseline - p.y)
    }
    var d = ""
    path.applyWithBlock { element in
        let e = element.pointee
        switch e.type {
        case .moveToPoint: d += "M\(at(e.points[0]))"
        case .addLineToPoint: d += "L\(at(e.points[0]))"
        case .addQuadCurveToPoint: d += "Q\(at(e.points[0])) \(at(e.points[1]))"
        case .addCurveToPoint:
            d += "C\(at(e.points[0])) \(at(e.points[1])) \(at(e.points[2]))"
        case .closeSubpath: d += "Z"
        @unknown default: fatalError("An outline element CoreText hasn't named.")
        }
    }
    outlines[w.key] = d
}

let json = try JSONSerialization.data(withJSONObject: outlines, options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
