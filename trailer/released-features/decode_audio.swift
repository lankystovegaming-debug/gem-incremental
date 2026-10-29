import AVFoundation
import Foundation

@main
struct DecodeAudio {
    static func main() async throws {
        let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
        let track = try await asset.loadTracks(withMediaType: .audio).first!
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 2,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ])
        reader.add(output)
        guard reader.startReading() else { throw reader.error! }
        var data = Data()
        while let sample = output.copyNextSampleBuffer() {
            guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
            let count = CMBlockBufferGetDataLength(block)
            var bytes = [UInt8](repeating: 0, count: count)
            let result = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: count, destination: &bytes)
            guard result == noErr else { throw NSError(domain: "AudioDecode", code: Int(result)) }
            data.append(contentsOf: bytes)
        }
        guard reader.status == .completed else { throw reader.error! }
        try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
    }
}
