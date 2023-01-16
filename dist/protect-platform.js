"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectPlatform = void 0;
const settings_1 = require("./settings");
const protect_nvr_1 = require("./protect-nvr");
const util_1 = __importDefault(require("util"));
class ProtectPlatform {
    constructor(log, config, api) {
        var _a, _b, _c;
        this.accessories = [];
        this.api = api;
        this.configOptions = [];
        this.controllers = [];
        this.verboseFfmpeg = false;
        this.log = log;
        // We can't start without being configured.
        if (!config) {
            return;
        }
        // Plugin options into our config variables.
        this.config = {
            controllers: config.controllers,
            debugAll: config.debug === true,
            ffmpegOptions: (_a = config.ffmpegOptions) !== null && _a !== void 0 ? _a : settings_1.PROTECT_FFMPEG_OPTIONS,
            motionDuration: (_b = config.motionDuration) !== null && _b !== void 0 ? _b : settings_1.PROTECT_MOTION_DURATION,
            options: config.options,
            ringDuration: (_c = config.ringDuration) !== null && _c !== void 0 ? _c : settings_1.PROTECT_RING_DURATION,
            verboseFfmpeg: config.verboseFfmpeg === true,
            videoEncoder: config.videoEncoder,
            videoProcessor: config.videoProcessor
        };
        // We need a UniFi Protect controller configured to do anything.
        if (!this.config.controllers) {
            this.log.info("No UniFi Protect controllers have been configured.");
            return;
        }
        // Debugging - most people shouldn't enable this.
        this.debug("Debug logging on. Expect a lot of data.");
        // Debug FFmpeg.
        if (this.config.verboseFfmpeg) {
            this.verboseFfmpeg = true;
            this.log.info("Verbose logging of video streaming sessions enabled. Expect a lot of data.");
        }
        // If we have feature options, put them into their own array, upper-cased for future reference.
        if (this.config.options) {
            for (const featureOption of this.config.options) {
                this.configOptions.push(featureOption.toUpperCase());
            }
        }
        // Motion detection duration. Make sure it's never less than 2 seconds so we can actually alert the user.
        if (this.config.motionDuration < 2) {
            this.config.motionDuration = 2;
        }
        // Ring trigger duration. Make sure it's never less than 3 seconds so we can ensure automations work.
        if (this.config.ringDuration < 3) {
            this.config.ringDuration = 3;
        }
        // Loop through each configured NVR and instantiate it.
        for (const controllerConfig of this.config.controllers) {
            // We need an address, or there's nothing to do.
            if (!controllerConfig.address) {
                this.log.info("No host or IP address has been configured.");
                continue;
            }
            // We need login credentials or we're skipping this one.
            if (!controllerConfig.username || !controllerConfig.password) {
                this.log.info("No UniFi Protect login credentials have been configured.");
                continue;
            }
            // Controller device list refresh interval. Make sure it's never less than 2 seconds so we don't overwhelm the Protect controller.
            if (controllerConfig.refreshInterval < 2) {
                controllerConfig.refreshInterval = 2;
            }
            // MQTT topic to use.
            if (!controllerConfig.mqttTopic) {
                controllerConfig.mqttTopic = settings_1.PROTECT_MQTT_TOPIC;
            }
            this.controllers.push(new protect_nvr_1.ProtectNvr(this, controllerConfig));
        }
        // Avoid a prospective race condition by waiting to configure our controllers until Homebridge is done
        // loading all the cached accessories it knows about, and calling configureAccessory() on each.
        api.on("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */, this.pollControllers.bind(this));
    }
    // This gets called when homebridge restores cached accessories at startup. We
    // intentionally avoid doing anything significant here, and save all that logic
    // for device discovery.
    configureAccessory(accessory) {
        // Delete the UniFi Protect device pointer on startup. This will be set by device discovery.
        // Notably, we do NOT clear out the NVR pointer, because we need to maintain the mapping between
        // camera and NVR.
        delete accessory.context.device;
        // Add this to the accessory array so we can track it.
        this.accessories.push(accessory);
    }
    // Launch our configured controllers. Once we do, they will sustain themselves.
    pollControllers() {
        for (const controller of this.controllers) {
            void controller.poll();
        }
    }
    // Utility for debug logging.
    debug(message, ...parameters) {
        if (this.config.debugAll) {
            this.log.info(util_1.default.format(message, ...parameters));
        }
    }
}
exports.ProtectPlatform = ProtectPlatform;
//# sourceMappingURL=protect-platform.js.map