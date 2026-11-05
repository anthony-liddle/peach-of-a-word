// The iOS app's own drawing code, compiled for the Mac, rendering each
// illustration in a manifest to a PNG on a transparent background.
//
//   swift run Render <manifest.json> <out dir> <px per unit> [candidates.json]
//
// PeachMark.swift is the app's, unchanged but for PartsLayer's `private`, so a
// candidate that never shipped can be drawn by the same code as a costume.
import AppKit
import Foundation
import ImageIO
@testable import PeachEngine
import SwiftUI
import UniformTypeIdentifiers

struct ManifestFile: Decodable {
    let path: String
    let name: String
    let kind: String
    let width: Double
    let height: Double
    let compareSize: [Double]?
    let source: [String: SourceValue]
}

enum SourceValue: Decodable {
    case string(String), bool(Bool)
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let s = try? c.decode(String.self) { self = .string(s) } else { self = .bool(try c.decode(Bool.self)) }
    }
    var string: String? { if case let .string(s) = self { return s }; return nil }
}

struct Manifest: Decodable { let files: [ManifestFile] }

struct Candidate: Decodable {
    struct Part: Decodable {
        let d: String
        let fill: String?
        let opacity: Double?
        let stroke: String?
        let strokeWidth: Double?
        let faceOnly: Bool?
    }
    let id: String
    let replacesFace: Bool
    let parts: [Part]
}

/// A candidate's parts over the peach, laid out as PeachMark lays out a
/// costume's: the peach, its face unless the costume replaces it, then the
/// parts, in the 100x100 box scaled to the frame.
struct CandidateMark: View {
    let parts: [CostumePart]
    let replacesFace: Bool
    var body: some View {
        ZStack {
            PeachMark(showsFace: !replacesFace)
            GeometryReader { geo in
                let scale = min(geo.size.width, geo.size.height) / 100
                PartsLayer(parts: parts, showsFace: true)
                    .frame(width: 100, height: 100)
                    .scaleEffect(scale, anchor: .topLeading)
            }
        }
    }
}

nonisolated(unsafe) var displayScale: Double = 3

@MainActor
func save(_ view: some View, width: Double, height: Double, to path: String) {
    // At the phone's own display scale, since SwiftUI rounds layout to the
    // display's pixels: the peach's face is laid out, not drawn as a path, so
    // a scale of 1 would round its circles to whole units of the drawing.
    let renderer = ImageRenderer(content: view.frame(width: width / displayScale, height: height / displayScale))
    renderer.scale = displayScale
    renderer.isOpaque = false
    guard let image = renderer.cgImage else { fatalError("no image for \(path)") }
    let url = URL(fileURLWithPath: path)
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                             withIntermediateDirectories: true)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("could not write \(path)") }
}

@MainActor
func run() throws {
    let args = CommandLine.arguments
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
    let out = args[2]
    let scale = Double(args[3])!
    if let s = ProcessInfo.processInfo.environment["DISPLAY_SCALE"] { displayScale = Double(s)! }
    var candidates: [String: Candidate] = [:]
    if args.count > 4 {
        for c in try JSONDecoder().decode([Candidate].self, from: Data(contentsOf: URL(fileURLWithPath: args[4]))) {
            candidates[c.id] = c
        }
    }
    var done = 0
    var skipped: [String] = []
    for f in manifest.files {
        let w = f.width * scale, h = f.height * scale
        let stem = "\(out)/\(f.path.dropLast(4))"
        if f.source["ios"]?.string == "PeachMark" {
            save(PeachMark(), width: w, height: h, to: "\(stem).png")
        } else if let id = f.source["costume"]?.string {
            guard let costume = Costume(rawValue: id) else { fatalError("no costume \(id) on iOS") }
            save(PeachMark(costume: costume), width: w, height: h, to: "\(stem).png")
            save(PeachMark(showsFace: !costume.replacesFace), width: w, height: h, to: "\(stem).base.png")
        } else if let id = f.source["alternate"]?.string {
            guard let c = candidates[id] else { fatalError("no candidate \(id)") }
            let parts = c.parts.map {
                CostumePart($0.d, fill: $0.fill, opacity: $0.opacity, stroke: $0.stroke,
                            strokeWidth: $0.strokeWidth, faceOnly: $0.faceOnly ?? false)
            }
            save(CandidateMark(parts: parts, replacesFace: c.replacesFace), width: w, height: h, to: "\(stem).png")
            save(PeachMark(showsFace: !c.replacesFace), width: w, height: h, to: "\(stem).base.png")
        } else if let id = f.source["stage"]?.string {
            guard let stage = GrowthStage(rawValue: id) else { fatalError("no stage \(id) on iOS") }
            save(GrowthMark(stage: stage), width: w, height: h, to: "\(stem).png")
        } else if f.source["crown"] != nil {
            // The phone's 46 by 26, at the size the check draws the file's
            // crown box.
            let size = f.compareSize ?? [w, h]
            save(Crown().fill(Cute.crown), width: size[0], height: size[1], to: "\(stem).png")
        } else if let character = f.source["character"]?.string {
            // As FoundWords.swift sets a mark, and Decorations.swift a
            // florette: the character in the system font, at one em to the
            // box, centred across it. iOS sets it in its own line, so the
            // check lines its ink up with the file's before comparing.
            let tint: Color = switch f.name {
            case "mark-set-heart": Cute.accent
            case "florette": Color(hex: 0x8FD3B6)
            default: Cute.discovery
            }
            let em = w / displayScale
            save(Text(character).font(.system(size: em)).foregroundStyle(tint)
                    .frame(width: em, alignment: .center).fixedSize(horizontal: false, vertical: true),
                 width: w, height: h, to: "\(stem).png")
        } else if let state = f.source["calendar"]?.string, state == "cleared" {
            // A cleared day with its own word found, its date left out.
            save(ArchiveCellFace(mark: .cleared(onTheDay: true, fromStreak: false), day: nil,
                                 size: w / displayScale, foundItsWord: true),
                 width: w, height: h, to: "\(stem).png")
        } else if f.source["icon"] != nil, let icon = ProcessInfo.processInfo.environment["IOS_ICON"] {
            // The app's own icon file, which is what the phone shows.
            try? FileManager.default.createDirectory(atPath: (stem as NSString).deletingLastPathComponent,
                                                     withIntermediateDirectories: true)
            try? FileManager.default.removeItem(atPath: "\(stem).png")
            try FileManager.default.copyItem(atPath: icon, toPath: "\(stem).png")
        } else {
            skipped.append(f.path)
            continue
        }
        done += 1
    }
    print("\(done) iOS renders; no iOS drawing for \(skipped.count): \(skipped.joined(separator: ", "))")
}

/// SwiftUI's own outline for `RoundedRectangle(cornerRadius:)` in a box, as
/// absolute SVG path data: the calendar cell's continuous corners.
func roundedRectPath(size: Double, radius: Double) -> String {
    let path = RoundedRectangle(cornerRadius: radius).path(in: CGRect(x: 0, y: 0, width: size, height: size))
    var out: [String] = []
    var last = CGPoint.zero
    func n(_ v: CGFloat) -> String {
        var s = String(format: "%.3f", Double(v))
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s == "-0" ? "0" : s
    }
    func pt(_ p: CGPoint) -> String { "\(n(p.x)) \(n(p.y))" }
    path.cgPath.applyWithBlock { el in
        let e = el.pointee
        switch e.type {
        case .moveToPoint: out.append("M\(pt(e.points[0]))"); last = e.points[0]
        case .addLineToPoint: out.append("L\(pt(e.points[0]))"); last = e.points[0]
        case .addQuadCurveToPoint:
            let c = e.points[0], to = e.points[1]
            let c1 = CGPoint(x: last.x + 2 / 3 * (c.x - last.x), y: last.y + 2 / 3 * (c.y - last.y))
            let c2 = CGPoint(x: to.x + 2 / 3 * (c.x - to.x), y: to.y + 2 / 3 * (c.y - to.y))
            out.append("C\(pt(c1)) \(pt(c2)) \(pt(to))"); last = to
        case .addCurveToPoint:
            out.append("C\(pt(e.points[0])) \(pt(e.points[1])) \(pt(e.points[2]))"); last = e.points[2]
        case .closeSubpath: out.append("Z")
        @unknown default: fatalError("unknown path element")
        }
    }
    return out.joined(separator: " ")
}

if CommandLine.arguments.count > 1, CommandLine.arguments[1] == "--rounded-rect" {
    print(roundedRectPath(size: Double(CommandLine.arguments[2])!, radius: Double(CommandLine.arguments[3])!))
    exit(0)
}

MainActor.assumeIsolated { try! run() }
