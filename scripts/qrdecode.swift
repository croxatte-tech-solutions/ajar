// Decode QR codes from a PNG using Apple's Vision framework — the same
// detector behind the iPhone camera. This is the only way to answer the
// question that matters: not "did the library run" but "can a phone read
// what it produced, and does it say the right URL".
//
//   swift qrdecode.swift file.png [file2.png ...]
//
// Prints one line per file: PATH<TAB>DECODED, or PATH<TAB>!!NONE if the
// detector found nothing — which is exactly the failure a student would
// experience standing in front of a projector.
import Foundation
import Vision
import AppKit

var exitCode: Int32 = 0

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let cg = bitmap.cgImage else {
        print("\(path)\t!!UNREADABLE")
        exitCode = 1
        continue
    }

    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])

    do {
        try handler.perform([request])
        let found = (request.results ?? []).compactMap { $0.payloadStringValue }
        if found.isEmpty {
            print("\(path)\t!!NONE")
            exitCode = 1
        } else {
            for payload in found { print("\(path)\t\(payload)") }
        }
    } catch {
        print("\(path)\t!!ERROR \(error.localizedDescription)")
        exitCode = 1
    }
}

exit(exitCode)
