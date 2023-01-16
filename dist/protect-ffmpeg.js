"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FfmpegProcess = void 0;
/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-ffmpeg.ts: Base class to provide FFmpeg process control and capability introspection.
 *
 * This module is heavily inspired by the homebridge and homebridge-camera-ffmpeg source code and
 * borrows heavily from both. Thank you for your contributions to the HomeKit world.
 */
const child_process_1 = require("child_process");
const events_1 = require("events");
const util_1 = __importDefault(require("util"));
// Base class for all FFmpeg process management.
class FfmpegProcess extends events_1.EventEmitter {
    // Create a new FFmpeg process instance.
    constructor(protectCamera, commandLineArgs, callback) {
        // Initialize our parent.
        super();
        this.callback = null;
        this.commandLineArgs = [];
        this.debug = protectCamera.platform.debug.bind(protectCamera.platform);
        this.stderrLog = [];
        this.isLogging = false;
        this.isPrepared = false;
        this.isEnded = false;
        this.isStarted = false;
        this.log = protectCamera.platform.log;
        this.name = protectCamera.name.bind(protectCamera);
        this.nvr = protectCamera.nvr;
        this.process = null;
        this.protectCamera = protectCamera;
        // Toggle FFmpeg logging, if configured.
        this.isVerbose = protectCamera.platform.verboseFfmpeg || protectCamera.stream.verboseFfmpeg;
        // If we've specified a command line or a callback, let's save them.
        if (commandLineArgs) {
            this.commandLineArgs = commandLineArgs;
        }
        if (callback) {
            this.callback = callback;
        }
    }
    // Prepare and start our FFmpeg process.
    prepareProcess(commandLineArgs, callback) {
        // If we've specified a new command line or callback, let's save them.
        if (commandLineArgs) {
            this.commandLineArgs = commandLineArgs;
        }
        // No command line arguments - we're done.
        if (!this.commandLineArgs) {
            this.log.error("%s: No FFmpeg command line specified.", this.name());
            return;
        }
        // Save the callback, if we have one.
        if (callback) {
            this.callback = callback;
        }
        // See if we should display ffmpeg command output.
        this.isLogging = false;
        // Track if we've started or ended FFmpeg.
        this.isStarted = false;
        this.isEnded = false;
        // If we've got a loglevel specified, ensure we display it.
        if (this.commandLineArgs.indexOf("-loglevel") !== -1) {
            this.isLogging = true;
        }
        // Inform the user, if we've been asked to do so.
        if (this.isLogging || this.isVerbose || this.protectCamera.platform.config.debugAll) {
            this.log.info("%s: ffmpeg command: %s %s", this.name(), this.protectCamera.stream.videoProcessor, this.commandLineArgs.join(" "));
        }
        else {
            this.debug("%s: ffmpeg command: %s %s", this.name(), this.protectCamera.stream.videoProcessor, this.commandLineArgs.join(" "));
        }
        this.isPrepared = true;
    }
    // Start our FFmpeg process.
    start(commandLineArgs, callback, errorHandler) {
        // If we haven't prepared our FFmpeg process, do so now.
        if (!this.isPrepared) {
            this.prepareProcess(commandLineArgs, callback);
            if (!this.isPrepared) {
                this.log.error("%s: Error preparing to run FFmpeg.", this.name());
                return;
            }
        }
        // Execute the command line based on what we've prepared.
        this.process = (0, child_process_1.spawn)(this.protectCamera.stream.videoProcessor, this.commandLineArgs);
        // Configure any post-spawn listeners and other plumbing.
        this.configureProcess(errorHandler);
    }
    // Configure our FFmpeg process, once started.
    configureProcess(errorHandler) {
        var _a, _b, _c, _d, _e, _f;
        let dataListener;
        let errorListener;
        // Handle errors emitted during process creation, such as an invalid command line.
        (_a = this.process) === null || _a === void 0 ? void 0 : _a.once("error", (error) => {
            this.log.error("%s: FFmpeg failed to start: %s", this.name(), error.message);
            // Execute our error handler, if one is provided.
            if (errorHandler) {
                void errorHandler(error.name + ": " + error.message);
            }
        });
        // Handle errors on stdin.
        (_c = (_b = this.process) === null || _b === void 0 ? void 0 : _b.stdin) === null || _c === void 0 ? void 0 : _c.on("error", errorListener = (error) => {
            if (!error.message.includes("EPIPE")) {
                this.log.error("%s: FFmpeg error: %s.", this.name(), error.message);
            }
        });
        // Handle logging output that gets sent to stderr.
        (_e = (_d = this.process) === null || _d === void 0 ? void 0 : _d.stderr) === null || _e === void 0 ? void 0 : _e.on("data", dataListener = (data) => {
            // Inform us when we start receiving data back from FFmpeg. We do this here because it's the only
            // truly reliable place we can check on FFmpeg. stdin and stdout may not be used at all, depending
            // on the way FFmpeg is called, but stderr will always be there.
            if (!this.isStarted) {
                this.isStarted = true;
                this.isEnded = false;
                this.debug("%s: Received the first frame.", this.name());
                this.emit("ffmpegStarted");
                // Always remember to execute the callback once we're setup to let homebridge know we're streaming.
                if (this.callback) {
                    this.callback();
                    this.callback = null;
                }
            }
            // Debugging and additional logging collection.
            for (const line of data.toString().split(/\n/)) {
                // Don't output not-printable characters to ensure the log output is readable.
                const cleanLine = line.replace(/[\p{Cc}\p{Cn}\p{Cs}]+/gu, "");
                // Don't print the FFmpeg progress bar to give clearer insights into what's going on.
                if (cleanLine.length && ((cleanLine.indexOf("frame=") === -1) || (cleanLine.indexOf("size=") === -1))) {
                    this.stderrLog.push(cleanLine + "\n");
                    // Show it to the user if it's been requested.
                    if (this.isLogging || this.isVerbose || this.protectCamera.platform.config.debugAll) {
                        this.log.info("%s: %s", this.name(), cleanLine);
                    }
                }
            }
        });
        // Handle our process termination.
        (_f = this.process) === null || _f === void 0 ? void 0 : _f.once("exit", (exitCode, signal) => {
            var _a, _b, _c, _d, _e;
            // Clear out our canary.
            if (this.ffmpegTimeout) {
                clearTimeout(this.ffmpegTimeout);
            }
            this.isStarted = false;
            this.isEnded = true;
            // Some utilities to streamline things.
            const logPrefix = this.name() + ": FFmpeg process ended ";
            // FFmpeg ended normally and our canary didn't need to enforce FFmpeg's extinction.
            if (this.ffmpegTimeout && exitCode === 0) {
                this.debug(logPrefix + "(Normal).");
            }
            else if (((exitCode === null) || (exitCode === 255)) && ((_a = this.process) === null || _a === void 0 ? void 0 : _a.killed)) {
                // FFmpeg has ended. Let's figure out if it's because we killed it or whether it died of natural causes.
                this.debug(logPrefix + (signal === "SIGKILL" ? "(Killed)." : "(Expected)."));
            }
            else {
                // Something else has occurred. Inform the user, and stop everything.
                this.log.error(logPrefix + "unexpectedly with %s%s%s.", (exitCode !== null) ? "an exit code of " + exitCode.toString() : "", ((exitCode !== null) && signal) ? " and " : "", signal ? "a signal received of " + signal : "");
                this.log.error("%s: FFmpeg command line that errored out was: %s %s", this.name(), this.protectCamera.stream.videoProcessor, this.commandLineArgs.join(" "));
                this.stderrLog.map(x => this.log.error(x));
                // Execute our error handler, if one is provided.
                if (errorHandler) {
                    void errorHandler(util_1.default.format(logPrefix + " unexpectedly with exit code %s and signal %s.", exitCode, signal));
                }
            }
            // Cleanup after ourselves.
            (_c = (_b = this.process) === null || _b === void 0 ? void 0 : _b.stdin) === null || _c === void 0 ? void 0 : _c.removeListener("error", errorListener);
            (_e = (_d = this.process) === null || _d === void 0 ? void 0 : _d.stderr) === null || _e === void 0 ? void 0 : _e.removeListener("data", dataListener);
            this.process = null;
            this.stderrLog = [];
        });
    }
    // Stop the FFmpeg process and complete any cleanup activities.
    stopProcess() {
        var _a, _b, _c, _d;
        // Check to make sure we aren't using stdin for data before telling FFmpeg we're done.
        if (!this.commandLineArgs.includes("pipe:0")) {
            (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin.end("q");
        }
        // Close our input and output.
        (_b = this.process) === null || _b === void 0 ? void 0 : _b.stdin.destroy();
        (_c = this.process) === null || _c === void 0 ? void 0 : _c.stdout.destroy();
        // In case we need to kill it again, just to be sure it's really dead.
        this.ffmpegTimeout = setTimeout(() => {
            var _a;
            (_a = this.process) === null || _a === void 0 ? void 0 : _a.kill("SIGKILL");
        }, 5000);
        // Send the kill shot.
        (_d = this.process) === null || _d === void 0 ? void 0 : _d.kill();
    }
    // Cleanup after we're done.
    stop() {
        this.stopProcess();
    }
    // Return the standard input for this process.
    get stdin() {
        var _a, _b;
        return (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) !== null && _b !== void 0 ? _b : null;
    }
    // Return the standard output for this process.
    get stdout() {
        var _a, _b;
        return (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdout) !== null && _b !== void 0 ? _b : null;
    }
    // Return the standard error for this process.
    get stderr() {
        var _a, _b;
        return (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stderr) !== null && _b !== void 0 ? _b : null;
    }
    // Validate whether or not we have a specific codec available to us in FFmpeg.
    static async codecEnabled(videoProcessor, codec, log) {
        try {
            // Promisify exec to allow us to wait for it asynchronously.
            const execAsync = util_1.default.promisify(child_process_1.execFile);
            // Check for the codecs in FFmpeg.
            const { stdout } = await execAsync(videoProcessor, ["-codecs"]);
            // See if we can find the codec.
            return stdout.includes(codec);
        }
        catch (error) {
            // It's really a SystemError, but Node hides that type from us for esoteric reasons.
            if (error instanceof Error) {
                const execError = error;
                if (execError.code === "ENOENT") {
                    log.error("Unable to find FFmpeg at: '%s'. Please make sure that you have a working version of FFmpeg installed.", execError.path);
                }
                else {
                    log.error("Error running FFmpeg: %s", error.message);
                }
            }
        }
        return false;
    }
}
exports.FfmpegProcess = FfmpegProcess;
//# sourceMappingURL=protect-ffmpeg.js.map