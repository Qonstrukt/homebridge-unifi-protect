"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpDemuxer = void 0;
/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-rtp.ts: RTP-related utilities to slice and dice RTP streams.
 *
 * This module is heavily inspired by the homebridge and homebridge-camera-ffmpeg source code and
 * borrows heavily from both. Thank you for your contributions to the HomeKit world.
 */
const events_1 = require("events");
const settings_1 = require("./settings");
const dgram_1 = require("dgram");
/*
 * Here's the problem this class solves: FFmpeg doesn't support multiplexing RTP and RTCP data on a single UDP port (RFC 5761).
 * If it did, we wouldn't need this workaround for HomeKit compatibility, which does multiplex RTP and RTCP over a single UDP port.
 *
 * This class inspects all packets coming in from inputPort and demultiplexes RTP and RTCP traffic to rtpPort and rtcpPort, respectively.
 *
 * Credit to @dgreif and @brandawg93 who graciously shared their code as a starting point, and their collaboration
 * in answering the questions needed to bring all this together. A special thank you to @Sunoo for the many hours of
 * discussion and brainstorming on this and other topics.
 */
class RtpDemuxer extends events_1.EventEmitter {
    // Create an instance of RtpDemuxer.
    constructor(streamingDelegate, ipFamily, inputPort, rtcpPort, rtpPort) {
        super();
        this._isRunning = false;
        this.debug = streamingDelegate.platform.debug.bind(streamingDelegate.platform);
        this.delegate = streamingDelegate;
        this.log = streamingDelegate.log;
        this.inputPort = inputPort;
        this.socket = (0, dgram_1.createSocket)(ipFamily === "ipv6" ? "udp6" : "udp4");
        // Catch errors when they happen on our demuxer.
        this.socket.on("error", (error) => {
            this.log.error("%s: RtpDemuxer Error: %s", this.delegate.protectCamera.name(), error);
            this.socket.close();
        });
        // Split the message into RTP and RTCP packets.
        this.socket.on("message", (msg) => {
            // Send RTP packets to the RTP port.
            if (this.isRtpMessage(msg)) {
                this.emit("rtp");
                this.socket.send(msg, rtpPort);
            }
            else {
                // Save this RTCP message for heartbeat purposes for the RTP port. This works because RTCP packets will be ignored
                // by ffmpeg on the RTP port, effectively providing a heartbeat to ensure FFmpeg doesn't timeout if there's an
                // extended delay between data transmission.
                this.heartbeatMsg = Buffer.from(msg);
                // Clear the old heartbeat timer.
                clearTimeout(this.heartbeatTimer);
                this.heartbeat(rtpPort);
                // RTCP control packets should go to the RTCP port.
                this.socket.send(msg, rtcpPort);
            }
        });
        this.debug("%s: Creating an RtpDemuxer instance - inbound port: %s, RTCP port: %s, RTP port: %s.", this.delegate.protectCamera.name(), this.inputPort, rtcpPort, rtpPort);
        // Take the socket live.
        this.socket.bind(this.inputPort);
        this._isRunning = true;
    }
    // Send a regular heartbeat to FFmpeg to ensure the pipe remains open and the process alive.
    heartbeat(port) {
        // Clear the old heartbeat timer.
        clearTimeout(this.heartbeatTimer);
        // Send a heartbeat to FFmpeg every few seconds to keep things open. FFmpeg has a five-second timeout
        // in reading input, and we want to be comfortably within the margin for error to ensure the process
        // continues to run.
        this.heartbeatTimer = setTimeout(() => {
            this.debug("Sending ffmpeg a heartbeat.");
            this.socket.send(this.heartbeatMsg, port);
            this.heartbeat(port);
        }, settings_1.PROTECT_TWOWAY_HEARTBEAT_INTERVAL * 1000);
    }
    // Close the socket and cleanup.
    close() {
        this.debug("%s: Closing the RtpDemuxer instance on port %s.", this.delegate.protectCamera.name(), this.inputPort);
        clearTimeout(this.heartbeatTimer);
        this.socket.close();
        this._isRunning = false;
        this.emit("rtp");
    }
    // Retrieve the payload information from a packet to discern what the packet payload is.
    getPayloadType(message) {
        return message.readUInt8(1) & 0x7f;
    }
    // Return whether or not a packet is RTP (or not).
    isRtpMessage(message) {
        const payloadType = this.getPayloadType(message);
        return (payloadType > 90) || (payloadType === 0);
    }
    // Inform people whether we are up and running or not.
    get isRunning() {
        return this._isRunning;
    }
}
exports.RtpDemuxer = RtpDemuxer;
//# sourceMappingURL=protect-rtp.js.map