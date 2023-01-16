"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FfmpegStreamingProcess = void 0;
/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-ffmpeg-stream.ts: Provide FFmpeg process control to support HomeKit livestreaming.
 *
 */
const protect_ffmpeg_1 = require("./protect-ffmpeg");
const dgram_1 = require("dgram");
// FFmpeg streaming process management.
class FfmpegStreamingProcess extends protect_ffmpeg_1.FfmpegProcess {
    // Create a new FFmpeg process instance.
    constructor(delegate, sessionId, commandLineArgs, returnPort, callback) {
        // Initialize our parent.
        super(delegate.protectCamera);
        this.delegate = delegate;
        this.sessionId = sessionId;
        // Create the return port for FFmpeg, if requested to do so. The only time we don't do this is when we're standing up
        // a two-way audio stream - in that case, the audio work is done through RtpSplitter and not here.
        if (returnPort) {
            this.createSocket(returnPort);
        }
        this.start(commandLineArgs, callback, async (errorMessage) => {
            // Stop the stream.
            await this.delegate.stopStream(this.sessionId);
            // Let homebridge know what happened and stop the stream if we've already started.
            if (!this.isStarted && this.callback) {
                this.callback(new Error(errorMessage));
                this.callback = null;
                return;
            }
            // Tell Homebridge to forcibly stop the streaming session.
            this.delegate.controller.forceStopStreamingSession(this.sessionId);
            void this.delegate.stopStream(this.sessionId);
        });
    }
    // Create the port for FFmpeg to send data through.
    createSocket(portInfo) {
        let errorListener;
        let messageListener;
        const socket = (0, dgram_1.createSocket)(portInfo.addressVersion === "ipv6" ? "udp6" : "udp4");
        // Cleanup after ourselves when the socket closes.
        socket.once("close", () => {
            if (this.streamTimeout) {
                clearTimeout(this.streamTimeout);
            }
            socket.removeListener("error", errorListener);
            socket.removeListener("message", messageListener);
        });
        // Handle potential network errors.
        socket.on("error", errorListener = (error) => {
            this.log.error("%s: Socket error: %s.", this.name(), error.name);
            void this.delegate.stopStream(this.sessionId);
        });
        // Manage our video streams in case we haven't received a stop request, but we're in fact dead zombies.
        socket.on("message", messageListener = () => {
            // Clear our last canary.
            if (this.streamTimeout) {
                clearTimeout(this.streamTimeout);
            }
            // Set our new canary.
            this.streamTimeout = setTimeout(() => {
                this.debug("%s: video stream appears to be inactive for 5 seconds. Stopping stream.", this.name());
                this.delegate.controller.forceStopStreamingSession(this.sessionId);
                void this.delegate.stopStream(this.sessionId);
            }, 5000);
        });
        // Bind to the port we're opening.
        socket.bind(portInfo.port);
    }
    // Return the actual FFmpeg process.
    get ffmpegProcess() {
        return this.process;
    }
}
exports.FfmpegStreamingProcess = FfmpegStreamingProcess;
//# sourceMappingURL=protect-ffmpeg-stream.js.map