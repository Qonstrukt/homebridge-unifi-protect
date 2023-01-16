"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectTimeshiftBuffer = void 0;
const unifi_protect_1 = require("unifi-protect");
const events_1 = require("events");
const settings_1 = require("./settings");
// UniFi Protect livestream timeshift buffer.
class ProtectTimeshiftBuffer extends events_1.EventEmitter {
    constructor(protectCamera) {
        // Initialize the event emitter.
        super();
        this.accessory = protectCamera.accessory;
        this.buffer = [];
        this.bufferSize = 1;
        this.channelId = 0;
        this.isStarted = false;
        this.livestream = new unifi_protect_1.ProtectLivestream(protectCamera.nvr.nvrApi, protectCamera.platform.log);
        this.log = protectCamera.platform.log;
        this.name = protectCamera.name.bind(protectCamera);
        this.nvr = protectCamera.nvr;
        this.protectCamera = protectCamera;
        // We use a small value for segment resolution in our timeshift buffer to ensure we provide an optimal timeshifting experience.
        // It's a very small amount of additional overhead for most modern CPUs, but the result is a much better HKSV event recording.
        this._segmentLength = settings_1.PROTECT_HKSV_SEGMENT_RESOLUTION;
        this._isTransmitting = false;
        this.configureTimeshiftBuffer();
    }
    // Configure the timeshift buffer.
    configureTimeshiftBuffer() {
        let seenInitSegment = false;
        // If the livestream API has closed, stop what we're doing.
        this.livestream.on("close", () => {
            this.log.error("%s: The Protect livestream API has closed unexpectedly and will retry again shortly. " +
                "This is usually due to a controller or camera restart and can be safely ignored.", this.name());
            this.stop();
        });
        // First, we need to listen for any segments sent by the UniFi Protect livestream in order
        // to create our timeshift buffer.
        this.livestream.on("message", (segment) => {
            var _a;
            // Crucially, we don't want to keep any initialization segment (which is always composed of
            // FTYP and MOOV boxes) in our timeshift buffer. The reason for this is that these boxes are
            // special in the fMP4 world and must be transmitted at the beginning of any new fMP4 stream.
            // So what do we do? The livestream saves the initialization segment for us, so all we need to
            // do is ensure we don't include them in our timeshift buffer. There should only ever be a single
            // initialization segment, so once we've seen one, we don't need to worry about it again.
            if (!seenInitSegment && ((_a = this.livestream.initSegment) === null || _a === void 0 ? void 0 : _a.equals(segment))) {
                seenInitSegment = true;
                return;
            }
            // Add the livestream segment to the end of the timeshift buffer.
            this.buffer.push(segment);
            // At a minimum we always want to maintain a single segment buffer.
            if (this.bufferSize <= 0) {
                this.bufferSize = 1;
            }
            // Trim the beginning of the buffer to our configured size unless we are transmitting
            // to HomeKit, in which case, we queue up all the segments for consumption.
            if (!this.isTransmitting && (this.buffer.length > this.bufferSize)) {
                this.buffer.splice(0, this.buffer.length - this.bufferSize);
            }
            // If we're transmitting, we want to send all the segments we can so FFmpeg can consume it.
            if (this.isTransmitting) {
                for (let nextOne = this.buffer.shift(); nextOne; nextOne = this.buffer.shift()) {
                    this.emit("segment", nextOne);
                }
            }
        });
    }
    // Start the livestream and begin creating our timeshift buffer.
    async start(channelId) {
        var _a, _b, _c, _d;
        // Ensure we have sane values configured for the segment resolution. We check this here instead of
        // in the constructor because we may not have an HKSV recording configuration available to us immediately upon startup.
        if ((_b = (_a = this.protectCamera.stream.hksv) === null || _a === void 0 ? void 0 : _a.recordingConfiguration) === null || _b === void 0 ? void 0 : _b.mediaContainerConfiguration.fragmentLength) {
            if ((this.segmentLength < 100) || (this.segmentLength > 1500) ||
                (this.segmentLength > (((_d = (_c = this.protectCamera.stream.hksv) === null || _c === void 0 ? void 0 : _c.recordingConfiguration) === null || _d === void 0 ? void 0 : _d.mediaContainerConfiguration.fragmentLength) / 2))) {
                this._segmentLength = settings_1.PROTECT_HKSV_SEGMENT_RESOLUTION;
            }
        }
        // Clear out the timeshift buffer, if it's been previously filled, and then fire up the timeshift buffer.
        this.buffer = [];
        // Start the livestream and start buffering.
        if (!(await this.livestream.start(this.accessory.context.device.id, channelId, this.segmentLength))) {
            return false;
        }
        this.channelId = channelId;
        this.isStarted = true;
        return true;
    }
    // Stop timeshifting the livestream.
    stop() {
        this.livestream.stop();
        this.buffer = [];
        this.isStarted = false;
        return true;
    }
    // Start or stop transmitting our timeshift buffer.
    async transmitStream(transmitState) {
        // If we're done transmitting, flag it, and allow our buffer to resume maintaining itself.
        if (!transmitState) {
            this._isTransmitting = false;
            return;
        }
        // If we haven't started the livestream, or it was closed for some reason, let's start it now.
        if (!this.isStarted && !(await this.start(this.channelId))) {
            this.log.error("%s: Unable to access the Protect livestream API. " +
                "This is usually due to the Protect controller or camera restarting. Will retry again on the next detected motion event.", this.name());
            return;
        }
        // Add the initialization segment to the beginning of the timeshift buffer, if we have it.
        // If we don't, FFmpeg will still be able to generate a valid fMP4 stream, albeit a slightly less elegantly.
        const initSegment = await this.livestream.getInitSegment();
        if (initSegment) {
            this.buffer.unshift(initSegment);
        }
        else {
            this.log.error("%s: Unable to get the fMP4 stream header.", this.name());
        }
        // Signal our livestream listener that it's time to start transmitting our queued segments and timeshift.
        this._isTransmitting = true;
    }
    // Check if this is the fMP4 initialization segment.
    isInitSegment(segment) {
        var _a;
        if ((_a = this.livestream.initSegment) === null || _a === void 0 ? void 0 : _a.equals(segment)) {
            return true;
        }
        return false;
    }
    getInitSegment() {
        return this.livestream.getInitSegment();
    }
    // Return whether we are transmitting our timeshift buffer or not.
    get isTransmitting() {
        return this._isTransmitting;
    }
    // Retrieve the current size of the timeshift buffer, in milliseconds.
    get length() {
        return (this.bufferSize * this.segmentLength);
    }
    // Set the size of the timeshift buffer, in milliseconds.
    set length(bufferMillis) {
        // Calculate how many segments we need to keep in order to have the appropriate number of seconds in
        // our buffer.
        this.bufferSize = bufferMillis / this.segmentLength;
    }
    // Return the recording length, in milliseconds, of an individual segment.
    get segmentLength() {
        return this._segmentLength;
    }
}
exports.ProtectTimeshiftBuffer = ProtectTimeshiftBuffer;
//# sourceMappingURL=protect-timeshift.js.map