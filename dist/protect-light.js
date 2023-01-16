"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectLight = void 0;
const protect_accessory_1 = require("./protect-accessory");
class ProtectLight extends protect_accessory_1.ProtectAccessory {
    // Initialize and configure the light accessory for HomeKit.
    async configureDevice() {
        var _a;
        this.lightState = false;
        // Save the device object before we wipeout the context.
        const device = this.accessory.context.device;
        // Clean out the context object in case it's been polluted somehow.
        this.accessory.context = {};
        this.accessory.context.device = device;
        this.accessory.context.nvr = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
        // Configure accessory information.
        this.configureInfo();
        // Configure the light.
        this.configureLightbulb();
        // Configure the motion sensor.
        this.configureMotionSensor();
        // Configure MQTT services.
        this.configureMqtt();
        return Promise.resolve(true);
    }
    // Configure the light for HomeKit.
    configureLightbulb() {
        var _a, _b;
        // Find the service, if it exists.
        let lightService = this.accessory.getService(this.hap.Service.Lightbulb);
        // Add the service to the accessory, if needed.
        if (!lightService) {
            lightService = new this.hap.Service.Lightbulb(this.accessory.displayName);
            if (!lightService) {
                this.log.error("%s: Unable to add light.", this.name());
                return false;
            }
            this.accessory.addService(lightService);
        }
        // Turn the light on or off.
        (_a = lightService.getCharacteristic(this.hap.Characteristic.On)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
            return this.accessory.context.device.isLightOn === true;
        }).onSet(async (value) => {
            const lightState = value === true;
            const newDevice = await this.nvr.nvrApi.updateLight(this.accessory.context.device, { lightOnSettings: { isLedForceOn: lightState } });
            if (!newDevice) {
                this.log.error("%s: Unable to turn the light %s. Please ensure this username has the Administrator role in UniFi Protect.", this.name(), lightState ? "on" : "off");
                return;
            }
            // Set the context to our updated device configuration.
            this.accessory.context.device = newDevice;
        });
        // Adjust the brightness of the light.
        (_b = lightService.getCharacteristic(this.hap.Characteristic.Brightness)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            // The Protect ledLevel settings goes from 1 - 6. HomeKit expects percentages, so we convert it like so.
            return (this.accessory.context.device.lightDeviceSettings.ledLevel - 1) * 20;
        }).onSet(async (value) => {
            const brightness = Math.round((value / 20) + 1);
            const newDevice = await this.nvr.nvrApi.updateLight(this.accessory.context.device, { lightDeviceSettings: { ledLevel: brightness } });
            if (!newDevice) {
                this.log.error("%s: Unable to adjust the brightness to %s%. Please ensure this username has the Administrator role in UniFi Protect.", this.name(), value);
                return;
            }
            // Set the context to our updated device configuration.
            this.accessory.context.device = newDevice;
            // Make sure we properly reflect what brightness we're actually at.
            setTimeout(() => {
                lightService === null || lightService === void 0 ? void 0 : lightService.updateCharacteristic(this.hap.Characteristic.Brightness, (brightness - 1) * 20);
            }, 50);
        });
        // Initialize the light.
        lightService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.device.isLightOn);
        lightService.updateCharacteristic(this.hap.Characteristic.Brightness, (this.accessory.context.device.lightDeviceSettings.ledLevel - 1) * 20);
        return true;
    }
    // Configure MQTT capabilities of this light.
    configureMqtt() {
        var _a;
        const lightService = this.accessory.getService(this.hap.Service.Lightbulb);
        if (!lightService) {
            return false;
        }
        // Trigger a motion event in MQTT, if requested to do so.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "light", (message) => {
            var _a, _b, _c;
            const value = message.toString();
            const brightness = parseInt(value);
            switch (value === null || value === void 0 ? void 0 : value.toLowerCase()) {
                case "off":
                    (_a = lightService.getCharacteristic(this.hap.Characteristic.On)) === null || _a === void 0 ? void 0 : _a.setValue(false);
                    this.log.info("%s: Light turned off via MQTT.", this.name());
                    break;
                case "on":
                    (_b = lightService.getCharacteristic(this.hap.Characteristic.On)) === null || _b === void 0 ? void 0 : _b.setValue(true);
                    this.log.info("%s: Light turned on via MQTT.", this.name());
                    break;
                default:
                    // Unknown message - ignore it.
                    if (isNaN(brightness) || (brightness < 0) || (brightness > 100)) {
                        return;
                    }
                    (_c = lightService.getCharacteristic(this.hap.Characteristic.Brightness)) === null || _c === void 0 ? void 0 : _c.setValue(brightness);
                    this.log.info("%s: Light set to %s% via MQTT.", this.name(), brightness);
                    break;
            }
        });
        return true;
    }
}
exports.ProtectLight = ProtectLight;
//# sourceMappingURL=protect-light.js.map