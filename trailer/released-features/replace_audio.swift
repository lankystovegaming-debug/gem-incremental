import AVFoundation
import Foundation

// Replace the soundtrack while preserving the picture timing and orientation.
@main
struct ReplaceAudio {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4 else { fatalError("Usage: replace_audio video audio output") }
        let video = AVURLAsset(url: URL(fileURLWithPath: args[1]))
        let audio = AVURLAsset(url: URL(fileURLWithPath: args[2]))
        let composition = AVMutableComposition()
        let duration = try await video.load(.duration)
        let sourceVideo = try await video.loadTracks(withMediaType: .video).first!
        let sourceAudio = try await audio.loadTracks(withMediaType: .audio).first!
        let targetVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
        let targetAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
        try targetVideo.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideo, at: .zero)
        targetVideo.preferredTransform = try await sourceVideo.load(.preferredTransform)
        try targetAudio.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceAudio, at: .zero)
        let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
        try await exporter.export(to: URL(fileURLWithPath: args[3]), as: .mp4)
    }
}
