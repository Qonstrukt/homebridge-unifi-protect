"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectNvrSystemInfo = void 0;
/* Copyright(C) 2019-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-nvr-systeminfo.ts: NVR System Information device class for UniFi Protect.
 */
const settings_1 = require("./settings");
const protect_accessory_1 = require("./protect-accessory");
class ProtectNvrSystemInfo extends protect_accessory_1.ProtectBase {
    // Configure our NVR sensor capability.
    constructor(nvr) {
        // Let the base class get us set up.
        super(nvr);
        // Initialize the class.
        this.isConfigured = false;
        this.systemInfo = null;
        this.accessory = null;
        this.configureAccessory();
    }
    // Configure the NVR system information accessory.
    configureAccessory() {
        var _a;
        // If we don't have the bootstrap configuration, we're done here.
        if (!this.nvrApi.bootstrap) {
            return;
        }
        // We've already configured our system information, we're done.
        if (this.isConfigured) {
            return;
        }
        const uuid = this.hap.uuid.generate(this.nvrApi.bootstrap.nvr.mac + ".NVRSystemInfo");
        // See if we already have this accessory defined.
        if (!this.accessory) {
            if ((this.accessory = this.platform.accessories.find((x) => x.UUID === uuid)) === undefined) {
                this.accessory = null;
            }
        }
        // If we've disabled NVR system information, remove the accessory if it exists.
        if (!this.nvr.optionEnabled(null, "NVR.SystemInfo", false)) {
            if (this.accessory) {
                this.log.info("%s: Removing UniFi Protect controller system information sensors.", this.name());
                // Unregister the accessory and delete it's remnants from HomeKit and the plugin.
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.accessory]);
                this.platform.accessories.splice(this.platform.accessories.indexOf(this.accessory), 1);
            }
            this.accessory = null;
            this.systemInfo = null;
            this.isConfigured = true;
            return;
        }
        // Create the accessory if it doesn't already exist.
        if (!this.accessory) {
            // We will use the NVR MAC address + ".NVRSystemInfo" to create our UUID. That should provide the guaranteed uniqueness we need.
            this.accessory = new this.api.platformAccessory(this.nvrApi.bootstrap.nvr.name, uuid);
            if (!this.accessory) {
                this.log.error("%s: Unable to create the system information accessory.", this.name());
                this.isConfigured = true;
                return;
            }
            // Register this accessory with homebridge and add it to the platform accessory array so we can track it.
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.accessory]);
            this.platform.accessories.push(this.accessory);
        }
        // We have the system information accessory, now let's configure it.
        // Clean out the context object in case it's been polluted somehow.
        this.accessory.context = {};
        this.accessory.context.nvr = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
        this.accessory.context.systemInfo = true;
        // Verify the NVR has been bootstrapped, and finish our configuration.
        if (this.nvr.nvrApi.bootstrap) {
            // Initialize our system information.
            this.systemInfo = this.nvr.nvrApi.bootstrap.nvr.systemInfo;
            // Configure accessory information.
            this.setInfo(this.accessory, this.nvr.nvrApi.bootstrap.nvr);
        }
        // Configure accessory services.
        const enabledSensors = this.updateDevice(true);
        // Inform the user what we're enabling on startup.
        if (enabledSensors.length) {
            this.log.info("%s: Enabled system information sensor%s: %s.", this.name(), enabledSensors.length > 1 ? "s" : "", enabledSensors.join(", "));
        }
        else {
            this.log.info("%s: No system information sensors enabled.", this.name());
        }
        this.configureMqtt();
        this.isConfigured = true;
    }
    // Update accessory services and characteristics.
    updateDevice(configureHandler = false, updatedInfo) {
        const enabledSensors = [];
        if (updatedInfo !== undefined) {
            this.systemInfo = updatedInfo;
        }
        // Configure the temperature sensor.
        if (this.configureTemperatureSensor(configureHandler)) {
            enabledSensors.push("cpu temperature");
        }
        // Configure MQTT services.
        // this.configureMqtt();
        return enabledSensors;
    }
    // Configure the temperature sensor for HomeKit.
    configureTemperatureSensor(configureHandler) {
        var _a, _b;
        // Ensure we have an accessory before we do anything else.
        if (!this.accessory) {
            return false;
        }
        // Find the service, if it exists.
        let temperatureService = this.accessory.getService(this.hap.Service.TemperatureSensor);
        // Have we disabled the temperature sensor?
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(null, "NVR.SystemInfo.Temperature"))) {
            if (temperatureService) {
                this.accessory.removeService(temperatureService);
                this.log.info("%s: Disabling CPU temperature sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!temperatureService) {
            temperatureService = new this.hap.Service.TemperatureSensor("CPU Temperature");
            if (!temperatureService) {
                this.log.error("%s: Unable to add CPU temperature sensor.", this.name());
                return false;
            }
            this.accessory.addService(temperatureService);
        }
        // If we're configuring for the first time, we add our respective handlers.
        if (configureHandler) {
            // Retrieve the current temperature when requested.
            (_b = temperatureService.getCharacteristic(this.hap.Characteristic.CurrentTemperature)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
                return this.getCpuTemp();
            });
        }
        // Update the sensor.
        temperatureService.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.getCpuTemp());
        return true;
    }
    // Retrieve the CPU temperature of the Protect NVR for HomeKit.
    getCpuTemp() {
        var _a, _b, _c;
        let cpuTemp = (_a = this.systemInfo) === null || _a === void 0 ? void 0 : _a.cpu.temperature;
        // No data available from the Protect NVR, so we default to a starting point.
        if (cpuTemp === undefined) {
            return 0;
        }
        // HomeKit wants temperature values in Celsius, so we need to convert accordingly, if needed.
        if (((_c = (_b = this.nvrApi.bootstrap) === null || _b === void 0 ? void 0 : _b.nvr) === null || _c === void 0 ? void 0 : _c.temperatureUnit) === "F") {
            cpuTemp = (cpuTemp - 32) * (5 / 9);
        }
        return cpuTemp;
    }
    // Configure MQTT capabilities for the security system.
    configureMqtt() {
        var _a, _b, _c;
        if (!((_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac)) {
            return;
        }
        // Return the current status of all sensors.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribe((_c = this.nvrApi.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr.mac, "systeminfo/get", (message) => {
            var _a, _b, _c;
            const value = message.toString().toLowerCase();
            // When we get the right message, we return the system information JSON.
            if (value !== "true") {
                return;
            }
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish((_c = (_b = this.nvrApi.bootstrap) === null || _b === void 0 ? void 0 : _b.nvr.mac) !== null && _c !== void 0 ? _c : "", "systeminfo", JSON.stringify(this.systemInfo));
            this.log.info("%s: System information published via MQTT.", this.name());
        });
    }
}
exports.ProtectNvrSystemInfo = ProtectNvrSystemInfo;
//# sourceMappingURL=protect-nvr-systeminfo.js.map