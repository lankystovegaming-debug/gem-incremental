import AppKit
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

enum TrailerError: Error {
    case badArguments
    case missingFrames
    case missingTrack(String)
    case pixelBuffer
    case imageDecode(String)
    case writer(String)
    case exporter(String)
}

func pixelBuffer(from image: CGImage, pool: CVPixelBufferPool, width: Int, height: Int) throws -> CVPixelBuffer {
    var maybeBuffer: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &maybeBuffer) == kCVReturnSuccess,
          let buffer = maybeBuffer else { throw TrailerError.pixelBuffer }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw TrailerError.pixelBuffer }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: base,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else { throw TrailerError.pixelBuffer }
    context.interpolationQuality = .high
    // The BGRA pixel-buffer context already uses the orientation expected by
    // AVAssetWriter. Applying a Core Graphics axis flip here mirrors the movie.
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buffer
}

func finish(_ writer: AVAssetWriter) async throws {
    await withCheckedContinuation { continuation in
        writer.finishWriting { continuation.resume() }
    }
    if writer.status != .completed {
        throw TrailerError.writer(writer.error?.localizedDescription ?? "Unknown writer error")
    }
}

@main
struct TrailerEncoder {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 7,
              let fps = Int32(args[4]),
              let width = Int(args[5]),
              let height = Int(args[6]) else { throw TrailerError.badArguments }

        let frameDirectory = URL(fileURLWithPath: args[1], isDirectory: true)
        let audioURL = URL(fileURLWithPath: args[2])
        let outputURL = URL(fileURLWithPath: args[3])
        let silentURL = outputURL.deletingLastPathComponent().appendingPathComponent(".silent-trailer.mp4")
        let fm = FileManager.default
        try? fm.removeItem(at: silentURL)
        try? fm.removeItem(at: outputURL)

        let frames = try fm.contentsOfDirectory(at: frameDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension.lowercased() == "jpg" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        guard !frames.isEmpty else { throw TrailerError.missingFrames }

        let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mp4)
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 7_500_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2
            ]
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        input.expectsMediaDataInRealTime = false
        let attributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
        guard writer.canAdd(input) else { throw TrailerError.writer("Cannot add video input") }
        writer.add(input)
        guard writer.startWriting() else { throw TrailerError.writer(writer.error?.localizedDescription ?? "Cannot start writer") }
        writer.startSession(atSourceTime: .zero)
        guard let pool = adaptor.pixelBufferPool else { throw TrailerError.pixelBuffer }

        for (index, url) in frames.enumerated() {
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 2_000_000)
            }
            guard let image = NSImage(contentsOf: url),
                  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                throw TrailerError.imageDecode(url.lastPathComponent)
            }
            let buffer = try pixelBuffer(from: cgImage, pool: pool, width: width, height: height)
            let time = CMTime(value: CMTimeValue(index), timescale: fps)
            guard adaptor.append(buffer, withPresentationTime: time) else {
                throw TrailerError.writer(writer.error?.localizedDescription ?? "Frame append failed")
            }
        }
        input.markAsFinished()
        try await finish(writer)
        // Frames are no longer needed once the silent H.264 stream is closed.
        // Removing them here keeps enough headroom for the audio mux/export.
        try? fm.removeItem(at: frameDirectory)

        let videoAsset = AVURLAsset(url: silentURL)
        let audioAsset = AVURLAsset(url: audioURL)
        guard let videoTrack = try await videoAsset.loadTracks(withMediaType: .video).first else {
            throw TrailerError.missingTrack("video")
        }
        guard let audioTrack = try await audioAsset.loadTracks(withMediaType: .audio).first else {
            throw TrailerError.missingTrack("audio")
        }
        let composition = AVMutableComposition()
        guard let compositionVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let compositionAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw TrailerError.missingTrack("composition")
        }
        let duration = try await videoAsset.load(.duration)
        try compositionVideo.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: videoTrack, at: .zero)
        try compositionAudio.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: audioTrack, at: .zero)

        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw TrailerError.exporter("Cannot create export session")
        }
        exporter.outputURL = outputURL
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = true
        await exporter.export()
        if exporter.status != .completed {
            throw TrailerError.exporter(exporter.error?.localizedDescription ?? "Unknown export error")
        }
        try? fm.removeItem(at: silentURL)
        print(outputURL.path)
    }
}
