"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectNvr = void 0;
const settings_1 = require("./settings");
const unifi_protect_1 = require("unifi-protect");
const protect_camera_1 = require("./protect-camera");
const protect_doorbell_1 = require("./protect-doorbell");
const protect_light_1 = require("./protect-light");
const protect_liveviews_1 = require("./protect-liveviews");
const protect_mqtt_1 = require("./protect-mqtt");
const protect_nvr_events_1 = require("./protect-nvr-events");
const protect_nvr_systeminfo_1 = require("./protect-nvr-systeminfo");
const protect_sensor_1 = require("./protect-sensor");
const protect_viewer_1 = require("./protect-viewer");
class ProtectNvr {
    constructor(platform, nvrOptions) {
        this.api = platform.api;
        this.config = nvrOptions;
        this.configuredDevices = {};
        this.debug = platform.debug.bind(platform);
        this.doorbellCount = 0;
        this.isEnabled = false;
        this.hap = this.api.hap;
        this.lastMotion = {};
        this.lastRing = {};
        this.liveviews = null;
        this.log = platform.log;
        this.mqtt = null;
        this.name = nvrOptions.name;
        this.eventTimers = {};
        this.nvrAddress = nvrOptions.address;
        this.platform = platform;
        this.refreshInterval = nvrOptions.refreshInterval;
        this.systemInfo = null;
        this.unsupportedDevices = {};
        // Assign a name, if we don't have one.
        if (!this.name) {
            this.name = this.nvrAddress;
        }
        // Validate our Protect address and login information.
        if (!nvrOptions.address || !nvrOptions.username || !nvrOptions.password) {
            return;
        }
        // Initialize our connection to the UniFi Protect API.
        this.nvrApi = new unifi_protect_1.ProtectApi(nvrOptions.address, nvrOptions.username, nvrOptions.password, this.log);
        // Initialize our event handlers.
        this.events = new protect_nvr_events_1.ProtectNvrEvents(this);
        // Initialize our liveviews.
        this.liveviews = new protect_liveviews_1.ProtectLiveviews(this);
        // Initialize our NVR system information.
        this.systemInfo = new protect_nvr_systeminfo_1.ProtectNvrSystemInfo(this);
        // Cleanup any stray ffmpeg sessions on shutdown.
        this.api.on("shutdown" /* APIEvent.SHUTDOWN */, () => {
            var _a;
            for (const protectCamera of Object.values(this.configuredDevices)) {
                if (protectCamera instanceof protect_camera_1.ProtectCamera) {
                    this.debug("%s: Shutting down all video stream processes.", protectCamera.name());
                    void ((_a = protectCamera.stream) === null || _a === void 0 ? void 0 : _a.shutdown());
                }
            }
        });
    }
    // Configure a UniFi Protect device in HomeKit.
    configureDevice(accessory, device) {
        if (!accessory || !device) {
            return false;
        }
        switch (device.modelKey) {
            case "camera":
                // We have a UniFi Protect camera or doorbell.
                if (device.featureFlags.hasChime) {
                    this.configuredDevices[accessory.UUID] = new protect_doorbell_1.ProtectDoorbell(this, accessory);
                }
                else {
                    this.configuredDevices[accessory.UUID] = new protect_camera_1.ProtectCamera(this, accessory);
                }
                return true;
                break;
            case "light":
                // We have a UniFi Protect light.
                this.configuredDevices[accessory.UUID] = new protect_light_1.ProtectLight(this, accessory);
                return true;
                break;
            case "sensor":
                // We have a UniFi Protect sensor.
                this.configuredDevices[accessory.UUID] = new protect_sensor_1.ProtectSensor(this, accessory);
                return true;
                break;
            case "viewer":
                // We have a UniFi Protect viewer.
                this.configuredDevices[accessory.UUID] = new protect_viewer_1.ProtectViewer(this, accessory);
                return true;
                break;
            default:
                this.log.error("%s: Unknown device class `%s` detected for ``%s``", this.nvrApi.getNvrName(), device.modelKey, device.name);
                return false;
        }
    }
    // Discover UniFi Protect devices that may have been added to the NVR since we last checked.
    discoverDevices(devices) {
        var _a;
        // Iterate through the list of cameras that Protect has returned and sync them with what we show HomeKit.
        for (const device of devices !== null && devices !== void 0 ? devices : []) {
            // If we have no MAC address, name, or this camera isn't being managed by Protect, we skip.
            if (!device.mac || !device.name || device.isAdopting || !device.isAdopted) {
                continue;
            }
            // We only support certain devices.
            switch (device.modelKey) {
                case "camera":
                case "light":
                case "sensor":
                case "viewer":
                    break;
                default:
                    // If we've already informed the user about this one, we're done.
                    if (this.unsupportedDevices[device.mac]) {
                        continue;
                    }
                    // Notify the user we see this device, but we aren't adding it to HomeKit.
                    this.unsupportedDevices[device.mac] = true;
                    this.log.info("%s: UniFi Protect device type '%s' is not currently supported, ignoring: %s.", this.nvrApi.getNvrName(), device.modelKey, this.nvrApi.getDeviceName(device));
                    continue;
            }
            // Exclude or include certain devices based on configuration parameters.
            if (!this.optionEnabled(device)) {
                continue;
            }
            // Generate this device's unique identifier.
            const uuid = this.hap.uuid.generate(device.mac);
            let accessory;
            // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
            if ((accessory = this.platform.accessories.find(x => x.UUID === uuid)) === undefined) {
                accessory = new this.api.platformAccessory(device.name, uuid);
                this.log.info("%s: Adding %s to HomeKit.", this.nvrApi.getFullName(device), device.modelKey);
                // Register this accessory with homebridge and add it to the accessory array so we can track it.
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                this.platform.accessories.push(accessory);
            }
            // Link the accessory to it's device object and it's hosting NVR.
            accessory.context.device = device;
            accessory.context.nvr = (_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
            // Setup the Protect device if it hasn't been configured yet.
            if (!this.configuredDevices[accessory.UUID]) {
                this.configureDevice(accessory, device);
            }
            else {
                // Device-specific periodic reconfiguration. We need to do this to reflect state changes in
                // the Protect NVR (e.g. device settings changes) that we want to catch. Many of the realtime
                // changes are sent through the realtime update API, but a few things aren't, so we deal with that
                // here.
                switch (device.modelKey) {
                    case "camera":
                        // Check if we have changes to the exposed RTSP streams on our cameras.
                        void this.configuredDevices[accessory.UUID].configureVideoStream();
                        // Check for changes to the doorbell LCD as well.
                        if (device.featureFlags.hasLcdScreen) {
                            void this.configuredDevices[accessory.UUID].configureDoorbellLcdSwitch();
                        }
                        break;
                    case "viewer":
                        // Sync the viewer state with HomeKit.
                        void this.configuredDevices[accessory.UUID].updateDevice();
                        break;
                    default:
                        break;
                }
            }
        }
        return true;
    }
    // Discover and sync UniFi Protect devices between HomeKit and the Protect NVR.
    discoverAndSyncAccessories() {
        var _a, _b;
        if (this.nvrApi.cameras && !this.discoverDevices(this.nvrApi.cameras)) {
            this.log.error("%s: Error discovering camera devices.", this.nvrApi.getNvrName());
        }
        if (this.nvrApi.lights && !this.discoverDevices(this.nvrApi.lights)) {
            this.log.error("%s: Error discovering light devices.", this.nvrApi.getNvrName());
        }
        if (this.nvrApi.sensors && !this.discoverDevices(this.nvrApi.sensors)) {
            this.log.error("%s: Error discovering sensor devices.", this.nvrApi.getNvrName());
        }
        if (this.nvrApi.viewers && !this.discoverDevices(this.nvrApi.viewers)) {
            this.log.error("%s: Error discovering viewer devices.", this.nvrApi.getNvrName());
        }
        // Remove Protect devices that are no longer found on this Protect NVR, but we still have in HomeKit.
        this.cleanupDevices();
        // Configure our liveview-based accessories.
        (_a = this.liveviews) === null || _a === void 0 ? void 0 : _a.configureLiveviews();
        // Configure our NVR system information-related accessories.
        (_b = this.systemInfo) === null || _b === void 0 ? void 0 : _b.configureAccessory();
        return true;
    }
    // Update HomeKit with the latest status from Protect.
    async updateAccessories() {
        var _a;
        // Refresh the full device list from the Protect API.
        if (!(await this.nvrApi.refreshDevices())) {
            return false;
        }
        // This NVR has been disabled. Stop polling for updates and let the user know that we're done here.
        // Only run this check once, since we don't need to repeat it again.
        if (!this.isEnabled && !this.optionEnabled(null)) {
            this.log.info("%s: Disabling this Protect controller.", this.nvrApi.getNvrName());
            this.nvrApi.clearLoginCredentials();
            return true;
        }
        // Set a name for this NVR, if we haven't configured one for ourselves.
        if (!this.name && ((_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr)) {
            this.name = this.nvrApi.bootstrap.nvr.name;
        }
        // If not already configured by the user, set the refresh interval here depending on whether we
        // have UniFi OS devices or not, since non-UniFi OS devices don't have a realtime API. We also
        // check to see whether doorbell devices have been removed and restore the prior refresh interval, if needed.
        let refreshUpdated = false;
        if (!this.refreshInterval || (!this.doorbellCount && (this.refreshInterval !== this.config.refreshInterval))) {
            if (!this.refreshInterval) {
                this.refreshInterval = this.config.refreshInterval = settings_1.PROTECT_NVR_UNIFIOS_REFRESH_INTERVAL;
            }
            else {
                this.refreshInterval = this.config.refreshInterval;
            }
            // In case someone puts in an overly aggressive default value.
            if (this.refreshInterval < 2) {
                this.refreshInterval = this.config.refreshInterval = 2;
            }
            refreshUpdated = true;
        }
        if (refreshUpdated || !this.isEnabled) {
            // On startup or refresh interval change, we want to notify the user.
            this.log.info("%s: Controller refresh interval set to %s seconds.", this.nvrApi.getNvrName(), this.refreshInterval);
        }
        this.isEnabled = true;
        // Create an MQTT connection, if needed.
        if (!this.mqtt && this.config.mqttUrl) {
            this.mqtt = new protect_mqtt_1.ProtectMqtt(this);
        }
        // Check for any updates to the events API connection.
        this.events.update();
        // Sync status and check for any new or removed accessories.
        this.discoverAndSyncAccessories();
        // Refresh the accessory cache.
        this.api.updatePlatformAccessories(this.platform.accessories);
        return true;
    }
    // Periodically poll the Protect API for status.
    async poll() {
        // Loop forever.
        for (;;) {
            // Sleep until our next update.
            // eslint-disable-next-line no-await-in-loop
            await this.sleep(this.refreshInterval * 1000);
            // Refresh our Protect device information and gracefully handle Protect errors.
            // eslint-disable-next-line no-await-in-loop
            if (await this.updateAccessories()) {
                // Our Protect NVR is disabled. We're done.
                if (!this.isEnabled) {
                    return;
                }
            }
        }
    }
    // Cleanup removed Protect devices from HomeKit.
    cleanupDevices() {
        var _a, _b, _c, _d, _e;
        const nvr = (_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr;
        // If we don't have a valid bootstrap configuration, we're done here.
        if (!nvr) {
            return;
        }
        for (const oldAccessory of this.platform.accessories) {
            const oldDevice = oldAccessory.context.device;
            const oldNvr = oldAccessory.context.nvr;
            // Since we're accessing the shared accessories list for the entire platform, we need to ensure we
            // are only touching our cameras and not another NVR's.
            if (oldNvr !== nvr.mac) {
                continue;
            }
            // The NVR system information accessory is handled elsewhere.
            if (("systemInfo" in oldAccessory.context)) {
                continue;
            }
            // Liveview-centric accessories are handled elsewhere.
            if (("liveview" in oldAccessory.context) || oldAccessory.getService(this.hap.Service.SecuritySystem)) {
                continue;
            }
            // We found this accessory and it's for this NVR. Figure out if we really want to see it in HomeKit.
            if (oldDevice) {
                // Check to see if the device still exists on the NVR and the user has not chosen to hide it.
                switch (oldDevice.modelKey) {
                    case "camera":
                        if (((_b = this.nvrApi.cameras) === null || _b === void 0 ? void 0 : _b.some((x) => x.mac === oldDevice.mac)) &&
                            this.optionEnabled(oldDevice)) {
                            continue;
                        }
                        break;
                    case "light":
                        if (((_c = this.nvrApi.lights) === null || _c === void 0 ? void 0 : _c.some((x) => x.mac === oldDevice.mac)) &&
                            this.optionEnabled(oldDevice)) {
                            continue;
                        }
                        break;
                    case "sensor":
                        if (((_d = this.nvrApi.sensors) === null || _d === void 0 ? void 0 : _d.some((x) => x.mac === oldDevice.mac)) &&
                            this.optionEnabled(oldDevice)) {
                            continue;
                        }
                        break;
                    case "viewer":
                        if (((_e = this.nvrApi.viewers) === null || _e === void 0 ? void 0 : _e.some((x) => x.mac === oldDevice.mac)) &&
                            this.optionEnabled(oldDevice)) {
                            continue;
                        }
                        break;
                    default:
                        break;
                }
            }
            // Decrement our doorbell count.
            if (oldAccessory.getService(this.hap.Service.Doorbell)) {
                this.doorbellCount--;
            }
            // Remove this device.
            this.log.info("%s %s: Removing %s from HomeKit.", this.nvrApi.getNvrName(), oldDevice ? this.nvrApi.getDeviceName(oldDevice) : oldAccessory.displayName, oldDevice ? oldDevice.modelKey : "device");
            // Unregister the accessory and delete it's remnants from HomeKit and the plugin.
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [oldAccessory]);
            delete this.configuredDevices[oldAccessory.UUID];
            this.platform.accessories.splice(this.platform.accessories.indexOf(oldAccessory), 1);
        }
    }
    // Lookup a device by it's identifier and return the associated accessory, if any.
    accessoryLookup(deviceId) {
        if (!deviceId) {
            return undefined;
        }
        // Find the device in our list of accessories.
        const foundDevice = Object.keys(this.configuredDevices).find(x => this.configuredDevices[x].accessory.context.device.id === deviceId);
        return foundDevice ? this.configuredDevices[foundDevice].accessory : undefined;
    }
    // Utility function to let us know if a device or feature should be enabled or not.
    optionEnabled(device, option = "", defaultReturnValue = true, address = "", addressOnly = false) {
        var _a, _b, _c;
        // There are a couple of ways to enable and disable options. The rules of the road are:
        //
        // 1. Explicitly disabling, or enabling an option on the NVR propogates to all the devices
        //    that are managed by that NVR. Why might you want to do this? Because...
        //
        // 2. Explicitly disabling, or enabling an option on a device by its MAC address will always
        //    override the above. This means that it's possible to disable an option for an NVR,
        //    and all the cameras that are managed by it, and then override that behavior on a single
        //    camera that it's managing.
        const configOptions = (_a = this.platform) === null || _a === void 0 ? void 0 : _a.configOptions;
        // Nothing configured - we assume the default return value.
        if (!configOptions) {
            return defaultReturnValue;
        }
        // Upper case parameters for easier checks.
        option = option ? option.toUpperCase() : "";
        address = address ? address.toUpperCase() : "";
        const deviceMac = (device === null || device === void 0 ? void 0 : device.mac) ? device.mac.toUpperCase() : "";
        let optionSetting;
        // If we've specified an address parameter - we check for device and address-specific options before
        // anything else.
        if (address && option) {
            // Test for device-specific and address-specific option settings, used together.
            if (deviceMac) {
                optionSetting = option + "." + deviceMac + "." + address;
                // We've explicitly enabled this option for this device and address combination.
                if (configOptions.indexOf("ENABLE." + optionSetting) !== -1) {
                    return true;
                }
                // We've explicitly disabled this option for this device and address combination.
                if (configOptions.indexOf("DISABLE." + optionSetting) !== -1) {
                    return false;
                }
            }
            // Test for address-specific option settings only.
            optionSetting = option + "." + address;
            // We've explicitly enabled this option for this address.
            if (configOptions.indexOf("ENABLE." + optionSetting) !== -1) {
                return true;
            }
            // We've explicitly disabled this option for this address.
            if (configOptions.indexOf("DISABLE." + optionSetting) !== -1) {
                return false;
            }
            // We're only interested in address-specific options.
            if (addressOnly) {
                return false;
            }
        }
        // If we've specified a device, check for device-specific options first. Otherwise, we're dealing
        // with an NVR-specific or global option.
        if (deviceMac) {
            // First we test for camera-level option settings.
            // No option specified means we're testing to see if this device should be shown in HomeKit.
            optionSetting = option ? option + "." + deviceMac : deviceMac;
            // We've explicitly enabled this option for this device.
            if (configOptions.indexOf("ENABLE." + optionSetting) !== -1) {
                return true;
            }
            // We've explicitly disabled this option for this device.
            if (configOptions.indexOf("DISABLE." + optionSetting) !== -1) {
                return false;
            }
        }
        // If we don't have a managing device attached, we're done here.
        if (!((_c = (_b = this.nvrApi.bootstrap) === null || _b === void 0 ? void 0 : _b.nvr) === null || _c === void 0 ? void 0 : _c.mac)) {
            return defaultReturnValue;
        }
        // Now we test for NVR-level option settings.
        // No option specified means we're testing to see if this NVR (and it's attached devices) should be shown in HomeKit.
        const nvrMac = this.nvrApi.bootstrap.nvr.mac.toUpperCase();
        optionSetting = option ? option + "." + nvrMac : nvrMac;
        // We've explicitly enabled this option for this NVR and all the devices attached to it.
        if (configOptions.indexOf("ENABLE." + optionSetting) !== -1) {
            return true;
        }
        // We've explicitly disabled this option for this NVR and all the devices attached to it.
        if (configOptions.indexOf("DISABLE." + optionSetting) !== -1) {
            return false;
        }
        // Finally, let's see if we have a global option here.
        // No option means we're done - it's a special case for testing if an NVR or camera should be hidden in HomeKit.
        if (!option) {
            return defaultReturnValue;
        }
        // We've explicitly enabled this globally for all devices.
        if (configOptions.indexOf("ENABLE." + option) !== -1) {
            return true;
        }
        // We've explicitly disabled this globally for all devices.
        if (configOptions.indexOf("DISABLE." + option) !== -1) {
            return false;
        }
        // Nothing special to do - assume the option is defaultReturnValue.
        return defaultReturnValue;
    }
    // Utility function to return a configuration parameter for a Protect device.
    optionGet(device, option, address = "") {
        var _a, _b, _c, _d;
        // Using the same rules as we do to test for whether an option is enabled, retrieve options with parameters and
        // return them. If we don't find anything, we return undefined.
        const configOptions = (_a = this.platform) === null || _a === void 0 ? void 0 : _a.configOptions;
        // Nothing configured - we assume there's nothing.
        if (!configOptions || !option) {
            return undefined;
        }
        // Upper case parameters for easier checks.
        address = address ? address.toUpperCase() : "";
        option = option.toUpperCase();
        const deviceMac = (_b = device === null || device === void 0 ? void 0 : device.mac.toUpperCase()) !== null && _b !== void 0 ? _b : null;
        let foundOption;
        let optionSetting;
        // If we've specified an address parameter - we check for device and address-specific options before
        // anything else.
        if (address) {
            // Test for device-specific and address-specific option settings, used together.
            if (deviceMac) {
                // We've explicitly enabled this option for this device and address combination.
                optionSetting = "ENABLE." + option + "." + deviceMac + "." + address + ".";
                if ((foundOption = configOptions.find(x => optionSetting === x.slice(0, optionSetting.length))) !== undefined) {
                    return foundOption.slice(optionSetting.length);
                }
                // We've explicitly disabled this option for this device and address combination.
                optionSetting = "DISABLE." + option + "." + deviceMac + "." + address;
                if (configOptions.indexOf(optionSetting) !== -1) {
                    return undefined;
                }
            }
            // We've explicitly enabled this option for this address.
            optionSetting = "ENABLE." + option + "." + address + ".";
            if ((foundOption = configOptions.find(x => optionSetting === x.slice(0, optionSetting.length))) !== undefined) {
                return foundOption.slice(optionSetting.length);
            }
            // We've explicitly disabled this option for this address.
            optionSetting = "DISABLE." + option + "." + address;
            if (configOptions.indexOf(optionSetting) !== -1) {
                return undefined;
            }
        }
        // If we've specified a device, check for device-specific options first. Otherwise, we're dealing
        // with an NVR-specific or global option.
        if (deviceMac) {
            // First we test for camera-level option settings.
            // No option specified means we're testing to see if this device should be shown in HomeKit.
            optionSetting = "ENABLE." + option + "." + deviceMac + ".";
            // We've explicitly enabled this option for this device.
            if ((foundOption = configOptions.find(x => optionSetting === x.slice(0, optionSetting.length))) !== undefined) {
                return foundOption.slice(optionSetting.length);
            }
            // We've explicitly disabled this option for this device.
            optionSetting = "DISABLE." + option + "." + deviceMac;
            if (configOptions.indexOf(optionSetting) !== -1) {
                return undefined;
            }
        }
        // If we don't have a managing device attached, we're done here.
        if (!((_d = (_c = this.nvrApi.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr) === null || _d === void 0 ? void 0 : _d.mac)) {
            return undefined;
        }
        // Now we test for NVR-level option settings.
        // No option specified means we're testing to see if this NVR (and it's attached devices) should be shown in HomeKit.
        const nvrMac = this.nvrApi.bootstrap.nvr.mac.toUpperCase();
        optionSetting = "ENABLE." + option + "." + nvrMac + ".";
        // We've explicitly enabled this option for this NVR and all the devices attached to it.
        if ((foundOption = configOptions.find(x => optionSetting === x.slice(0, optionSetting.length))) !== undefined) {
            return foundOption.slice(optionSetting.length);
        }
        // We've explicitly disabled this option for this NVR and all the devices attached to it.
        optionSetting = "DISABLE." + option + "." + nvrMac;
        if (configOptions.indexOf(optionSetting) !== -1) {
            return undefined;
        }
        // Finally, let's see if we have a global option here.
        optionSetting = "ENABLE." + option + ".";
        // We've explicitly enabled this globally for all devices.
        if ((foundOption = configOptions.find(x => optionSetting === x.slice(0, optionSetting.length))) !== undefined) {
            return foundOption.slice(optionSetting.length);
        }
        // Nothing special to do - assume the option is defaultReturnValue.
        return undefined;
    }
    // Emulate a sleep function.
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ProtectNvr = ProtectNvr;
//# sourceMappingURL=protect-nvr.js.map