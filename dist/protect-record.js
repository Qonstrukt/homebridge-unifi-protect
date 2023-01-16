"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectRecordingDelegate = void 0;
const protect_ffmpeg_record_1 = require("./protect-ffmpeg-record");
const protect_timeshift_1 = require("./protect-timeshift");
// Camera recording delegate implementation for Protect.
class ProtectRecordingDelegate {
    // Create an instance of the HKSV recording delegate.
    constructor(protectCamera) {
        var _a;
        this._isRecording = false;
        this.accessory = protectCamera.accessory;
        this.api = protectCamera.api;
        this.hap = protectCamera.api.hap;
        this.debug = protectCamera.platform.debug.bind(protectCamera.platform);
        this.ffmpegStream = null;
        this.isInitialized = false;
        this.isTransmitting = false;
        this.log = protectCamera.platform.log;
        this.name = protectCamera.name.bind(protectCamera);
        this.nvr = protectCamera.nvr;
        this.protectCamera = protectCamera;
        this.maxRecordingDuration = parseInt((_a = this.nvr.optionGet(this.accessory.context.device, "Video.HKSV.Recording.MaxDuration")) !== null && _a !== void 0 ? _a : "0");
        this.timeshiftedSegments = 0;
        this.transmittedSegments = 0;
        this.rtspEntry = null;
        this.timeshift = new protect_timeshift_1.ProtectTimeshiftBuffer(protectCamera);
        this.transmitListener = null;
    }
    // Process HomeKit requests to activate or deactivate HKSV recording capabilities for a camera.
    async updateRecordingActive(active) {
        var _a, _b, _c;
        // If we are no longer recording, stop the livestream.
        if (!active) {
            this.timeshift.stop();
            // Inform the user of the state change, if needed.
            if (this.isRecording !== active) {
                this.log.info("%s: Disabling HomeKit Secure Video event recording.", this.name());
            }
            // Disable recording.
            this._isRecording = active;
            // Turn off any potential inflight motion detection. Strictly speaking, this shouldn't be needed since any inflight
            // motion sensor events will clear themselves. That said, we play it safe just the same.
            (_a = this.accessory.getService(this.hap.Service.MotionSensor)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
            // We're done.
            return;
        }
        // We have no recording configuration available yet. Set our desired state and we're done.
        // Once we have a recording configuration, we'll get called again and be able to begin timeshifting.
        if (!this.recordingConfig) {
            this._isRecording = active;
            return;
        }
        // Figure out which camera channel we should use for the livestream based on the requested resolution.
        this.rtspEntry = this.protectCamera.findRecordingRtsp(this.recordingConfig.videoCodec.resolution[0], this.recordingConfig.videoCodec.resolution[1], this.accessory.context.device);
        if (!this.rtspEntry) {
            this._isRecording = false;
            this.log.error("%s: Unable to start the HomeKit Secure Video timeshift buffer: no valid RTSP stream profile was found.", this.name());
            return;
        }
        // If the user has disabled timeshifting, don't start the timeshift buffer.
        if (this.nvr.optionEnabled(this.accessory.context.device, "Video.HKSV.TimeshiftBuffer")) {
            if (!this.recordingConfig || !this.rtspEntry) {
                return;
            }
            // Set the bitrate to what HomeKit is looking for. This is particularly useful when we occasionally have
            // to livestream to a user, where bitrates can be different and even get reconfigured in realtime. By
            // contrast, HomeKit Secure Video has a consistent bitrate it accepts, and we want to try to match it as
            // closely as posible.
            if (!(await this.protectCamera.setBitrate(this.rtspEntry.channel.id, this.recordingConfig.videoCodec.parameters.bitRate * 1000))) {
                this.log.error("%s: Unable to set the bitrate to %skbps for HomeKit Secure Video event recording.", this.name(), this.recordingConfig.videoCodec.parameters.bitRate);
                return;
            }
            // Fire up the timeshift buffer.
            if (!(await this.timeshift.start(this.rtspEntry.channel.id))) {
                this.log.error("%s: Unable to start the timeshift buffer for HomeKit Secure Video.", this.name());
                return;
            }
        }
        // Inform the user of the state change, if needed.
        if ((this._isRecording !== active) || !this.isInitialized) {
            this.isInitialized = true;
            this.log.info("%s: HomeKit Secure Video event recording enabled: %s, %s kbps with %s", this.name(), (_b = this.rtspEntry) === null || _b === void 0 ? void 0 : _b.name, (_c = this.recordingConfig) === null || _c === void 0 ? void 0 : _c.videoCodec.parameters.bitRate, this.nvr.optionEnabled(this.accessory.context.device, "Video.HKSV.TimeshiftBuffer") ?
                "a " + (this.timeshift.length / 1000).toString() + " second timeshift buffer." :
                "no timeshift buffer. Warning: this may provide a suboptimal HKSV experience.");
            // Inform the user if there's a maximum event recording duration set.
            if (this.maxRecordingDuration) {
                this.log.info("%s: HomeKit Secure Video recordings will be no longer than ~%s seconds.", this.name(), this.maxRecordingDuration);
            }
        }
        // Update our recording state internally.
        this._isRecording = active;
    }
    // Process updated recording configuration settings from HomeKit Secure Video.
    updateRecordingConfiguration(configuration) {
        // If we're set to an undefined state, it's because HomeKit can't figure out a valid configuration to use.
        // This is typically due to a factory reset of the camera or a similar edge case. We choose to handle it
        // by stopping our timeshift buffer.
        if (!configuration) {
            this.recordingConfig = configuration;
            this.timeshift.stop();
            return;
        }
        // Save the new recording configuration.
        this.recordingConfig = configuration;
        // Tell our timeshift buffer how many seconds HomeKit has requested we prebuffer.
        this.timeshift.length = this.recordingConfig.prebufferLength;
        // Start or restart our timeshift buffer based on our updated configuration.
        void this.updateRecordingActive(this.isRecording);
    }
    // Handle the actual recording stream request.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async *handleRecordingStreamRequest(streamId) {
        var _a, _b;
        let isLastSegment = false;
        this.transmittedSegments = 0;
        // If we've explicitly disabled HKSV recording, we're done right now. Otherwise, start transmitting our timeshift
        // buffer and process it through FFmpeg.
        if (!this.accessory.context.hksvRecording || !(await this.startTransmitting()) || !this.ffmpegStream) {
            // Stop transmitting, if needed. If HKSV recording has been disabled explicitly, it should never start in the first place.
            this.stopTransmitting();
            // Something's gone wrong, or we've disabled HKSV recording. In either event, we send an fMP4 stream header
            // back to HKSV and exit as cleanly as we can. If we can't get the stream header, we still send an empty segment
            // to HKSV - this will still generate a warning in Homebridge that can be ignored.
            const streamHeader = (_a = (await this.timeshift.getInitSegment())) !== null && _a !== void 0 ? _a : Buffer.alloc(0);
            yield { data: streamHeader, isLast: true };
            return;
        }
        // Process our FFmpeg-generated segments and send them back to HKSV.
        for await (const segment of this.ffmpegStream.segmentGenerator()) {
            // If we've not transmitting, we're done.
            if (!this.isTransmitting) {
                return;
            }
            // No segment doesn't mean we're done necessarily, but it does mean we need to wait for FFmpeg to catch up.
            if (!segment) {
                continue;
            }
            // If we've exceeded a user-configured maximum recording duration, let HomeKit know we're stopping. We imperfectly calculate
            // our recording duration by using the fact that each transmitted segment will contain a single I-frame. The method is imperfect because
            // partial segments happen, as well as other edge cases, but it's more than good enough for our purposes.
            if (this.maxRecordingDuration && this.rtspEntry && ((this.transmittedSegments * this.rtspEntry.channel.idrInterval) > this.maxRecordingDuration)) {
                isLastSegment = true;
            }
            // Send HKSV the segment.
            yield {
                data: segment,
                isLast: isLastSegment
            };
            // Keep track of how many segments we've sent to HKSV.
            this.transmittedSegments++;
            // If we've sent the last segment, we're done.
            if (isLastSegment) {
                return;
            }
        }
        // If we're done transmitting, we're done here.
        if (!this.isTransmitting) {
            return;
        }
        // Something's gone wrong and we've sent HKSV no segments. Let's send an fMP4 stream header back to HKSV and exit
        // as cleanly as we can. If we can't get the stream header, we send an empty segment to HKSV - this will still
        // generate a warning in HAP-NodeJS that can be ignored.
        if (!this.transmittedSegments) {
            this.debug("%s: HKSV event recording ending without sending any segments. Transmitting a final packet to ensure we end properly.", this.name());
            yield { data: (_b = (await this.timeshift.getInitSegment())) !== null && _b !== void 0 ? _b : Buffer.alloc(0), isLast: true };
            return;
        }
        // Something likely happened to FFmpeg and we didn't send out a final segment. Tell HKSV we're really done.
        if (!isLastSegment) {
            this.log.error("%s: HKSV event recording ending abruptly, likely due to an FFmpeg failure. " +
                "Transmitting a final packet to ensure we end properly. " +
                "Note: Homebridge / HAP-NodeJS may generate an HDS error as a result. This can be safely ignored.", this.name());
            yield { data: Buffer.alloc(0), isLast: true };
            return;
        }
    }
    // Receive an acknowledgement from HomeKit that it's seen an end-of-stream packet from us.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    acknowledgeStream(streamId) {
        // Since HomeKit knows our transmission is ending, it's safe to do so now.
        this.stopTransmitting();
    }
    // Process HomeKit requests to end the transmission of the recording stream.
    closeRecordingStream(streamId, reason) {
        this.stopTransmitting(reason);
    }
    // Start transmitting to the HomeKit hub our timeshifted fMP4 stream.
    async startTransmitting() {
        var _a;
        // If there's a prior instance of FFmpeg, clean up after ourselves.
        if (this.ffmpegStream) {
            this.ffmpegStream.stop();
            this.ffmpegStream = null;
        }
        // If there's a prior instance of our transmit handler, clean it up.
        if (this.transmitListener) {
            this.timeshift.removeListener("segment", this.transmitListener);
            this.transmitListener = null;
        }
        // If we don't have a recording configuration from HomeKit or an RTSP profile, we can't continue.
        if (!this.recordingConfig || !this.rtspEntry) {
            return false;
        }
        // We want to keep feeding HomeKit until it tells us it's finished, or we decide we don't want to send anymore
        // fMP4 packets. We treat this the same was a DVR works where you can pause live television, but it continues to
        // buffer what's being broadcast until you're ready to watch it. This is the same idea.
        // Keep track of how many fMP4 segments we are feeding FFmpeg.
        this.transmittedSegments = 0;
        // Check to see if the user has audio enabled or disabled for recordings.
        const isAudioActive = ((_a = this.protectCamera.stream.controller.recordingManagement) === null || _a === void 0 ? void 0 : _a.recordingManagementService.getCharacteristic(this.api.hap.Characteristic.RecordingAudioActive).value) === 1 ? true : false;
        // Start a new FFmpeg instance to transcode using HomeKit's requirements.
        this.ffmpegStream = new protect_ffmpeg_record_1.FfmpegRecordingProcess(this.protectCamera, this.recordingConfig, this.rtspEntry, isAudioActive);
        this.isTransmitting = true;
        // Let the timeshift buffer know it's time to transmit and continue timeshifting.
        if (this.nvr.optionEnabled(this.accessory.context.device, "Video.HKSV.TimeshiftBuffer")) {
            this.timeshiftedSegments = 0;
            await this.timeshift.transmitStream(true);
            let seenInitSegment = false;
            // Listen in for events from the timeshift buffer and feed FFmpeg. This looks simple, conceptually,
            // but there's a lot going on here.
            this.transmitListener = (segment) => {
                var _a, _b, _c, _d;
                if (!seenInitSegment && this.timeshift.isInitSegment(segment)) {
                    seenInitSegment = true;
                    (_b = (_a = this.ffmpegStream) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(segment);
                    return;
                }
                // We don't want to send the initialization segment more than once - FFmpeg will get confused if you do, plus
                // it's wrong and you should only send the fMP4 stream header information once.
                if (this.timeshift.isInitSegment(segment)) {
                    return;
                }
                // Send the segment to FFmpeg for processing.
                (_d = (_c = this.ffmpegStream) === null || _c === void 0 ? void 0 : _c.stdin) === null || _d === void 0 ? void 0 : _d.write(segment);
                this.timeshiftedSegments++;
            };
            this.timeshift.on("segment", this.transmitListener);
        }
        // Inform the user.
        this.log.debug("%s: Beginning a HomeKit Secure Video recording event.", this.name());
        return true;
    }
    // Stop transmitting the HomeKit hub our timeshifted fMP4 stream.
    stopTransmitting(reason) {
        var _a;
        const device = this.accessory.context.device;
        // We're done transmitting, so we can go back to maintaining our timeshift buffer for HomeKit.
        if (this.nvr.optionEnabled(device, "Video.HKSV.TimeshiftBuffer")) {
            void this.timeshift.transmitStream(false);
        }
        // Kill any FFmpeg sessions.
        if (this.ffmpegStream) {
            this.ffmpegStream.stop();
            this.ffmpegStream = null;
        }
        this.isTransmitting = false;
        if (this.transmitListener) {
            this.timeshift.removeListener("segment", this.transmitListener);
            this.transmitListener = null;
        }
        // We actually have one less segment than we think we do since we counted the fMP4 stream header as well, which
        // shouldn't count toward our total of transmitted video segments.
        if (this.transmittedSegments) {
            this.transmittedSegments--;
        }
        // Inform the user if we've recorded something.
        if (this.accessory.context.hksvRecording && this.transmittedSegments && this.rtspEntry) {
            // Calculate approximately how many seconds we've recorded. We have more accuracy in timeshifted segments, so we'll use the more
            // accurate statistics when we can. Otherwise, we use the number of segments transmitted to HomeKit as a close proxy.
            const recordedSeconds = this.timeshiftedSegments ?
                ((this.timeshiftedSegments * this.timeshift.segmentLength) / 1000) : (this.transmittedSegments * ((_a = this.rtspEntry) === null || _a === void 0 ? void 0 : _a.channel.idrInterval));
            let recordedTime = "";
            // Create a nicely formatted string for end users. Yes, the author recognizes this isn't
            // essential, but it does bring a smile to their face.
            if (recordedSeconds < 1) {
                recordedTime = recordedSeconds.toString();
            }
            else if (recordedSeconds < 60) {
                recordedTime = Math.round(recordedSeconds).toString();
            }
            else {
                // Calculate the time elements.
                const hours = Math.floor(recordedSeconds / 3600);
                const minutes = Math.floor((recordedSeconds % 3600) / 60);
                const seconds = Math.floor((recordedSeconds % 3600) % 60);
                // Build the string.
                if (hours > 10) {
                    recordedTime = hours.toString() + ":";
                }
                else if (hours > 0) {
                    recordedTime = "0" + hours.toString() + ":";
                }
                if (minutes > 10) {
                    recordedTime += minutes.toString() + ":";
                }
                else if (minutes > 0) {
                    recordedTime += (hours > 0) ? "0" : "" + minutes.toString() + ":";
                }
                if (recordedTime.length && (seconds < 10)) {
                    recordedTime += "0" + seconds.toString();
                }
                else {
                    recordedTime += seconds ? seconds.toString() : recordedSeconds.toString();
                }
            }
            let timeUnit;
            switch (recordedTime.split(":").length - 1) {
                case 1:
                    timeUnit = "minute";
                    break;
                case 2:
                    timeUnit = "hour";
                    break;
                default:
                    timeUnit = "second";
                    break;
            }
            // Inform the user if they've enabled logging. We log HKSV events by default, for now.
            if (this.nvr.optionEnabled(device, "Log.HKSV") ||
                this.nvr.optionEnabled(device, "Log.Motion", false)) {
                this.log.info("%s: HomeKit Secure Video has recorded %s %s %s motion event.", this.name(), this.timeshiftedSegments ? "a" : "an approximately", recordedTime, timeUnit);
            }
        }
        // If we have a reason for stopping defined, and it's noteworthy, inform the user.
        let reasonDescription;
        switch (reason) {
            case 3 /* HDSProtocolSpecificErrorReason.CANCELLED */:
                reasonDescription = "HomeKit canceled the request.";
                break;
            case 5 /* HDSProtocolSpecificErrorReason.UNEXPECTED_FAILURE */:
                reasonDescription = "An unexpected protocol failure has occured.";
                break;
            case 6 /* HDSProtocolSpecificErrorReason.TIMEOUT */:
                reasonDescription = "The request timed out.";
                break;
            default:
                break;
        }
        if ((reason !== undefined) && (reason !== 0 /* HDSProtocolSpecificErrorReason.NORMAL */)) {
            this.log.error("%s: HomeKit Secure Video event recording ended abnormally: %s", this.name(), reasonDescription);
        }
    }
    // Return our HomeKit Secure Video recording state. This effectively tells us if HKSV has been configured and is on.
    get isRecording() {
        return this._isRecording;
    }
    // Return our current HomeKit Secure Video recording configuration.
    get recordingConfiguration() {
        var _a;
        return (_a = this.recordingConfig) !== null && _a !== void 0 ? _a : null;
    }
}
exports.ProtectRecordingDelegate = ProtectRecordingDelegate;
//# sourceMappingURL=protect-record.js.map