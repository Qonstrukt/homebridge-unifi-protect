"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectSensor = void 0;
/* Copyright(C) 2019-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-sensor.ts: Sensor device class for UniFi Protect.
 */
const protect_accessory_1 = require("./protect-accessory");
class ProtectSensor extends protect_accessory_1.ProtectAccessory {
    // Initialize and configure the sensor accessory for HomeKit.
    async configureDevice() {
        var _a;
        // Save the device object before we wipeout the context.
        const device = this.accessory.context.device;
        // Clean out the context object in case it's been polluted somehow.
        this.accessory.context = {};
        this.accessory.context.device = device;
        this.accessory.context.nvr = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
        // Configure accessory information.
        this.configureInfo();
        // Configure accessory services.
        const enabledSensors = this.updateDevice();
        // Configure MQTT services.
        this.configureMqtt();
        // Inform the user what we're enabling on startup.
        if (enabledSensors.length) {
            this.log.info("%s: Enabled sensor%s: %s.", this.name(), enabledSensors.length > 1 ? "s" : "", enabledSensors.join(", "));
        }
        else {
            this.log.info("%s: No sensors enabled.", this.name());
        }
        return Promise.resolve(true);
    }
    // Update accessory services and characteristics.
    updateDevice() {
        var _a, _b;
        const enabledSensors = [];
        // Configure the alarm sound sensor.
        if (this.configureAlarmSoundSensor()) {
            enabledSensors.push("alarm sound");
        }
        // Configure the ambient light sensor.
        if (this.configureAmbientLightSensor()) {
            enabledSensors.push("ambient light");
        }
        // Configure the contact sensor.
        if (this.configureContactSensor()) {
            enabledSensors.push("contact");
        }
        // Configure the humidity sensor.
        if (this.configureHumiditySensor()) {
            enabledSensors.push("humidity");
        }
        // Configure the motion sensor.
        if (this.configureMotionSensor((_b = (_a = this.accessory.context.device) === null || _a === void 0 ? void 0 : _a.motionSettings) === null || _b === void 0 ? void 0 : _b.isEnabled)) {
            // Sensor accessories also support battery, connection, and tamper status...we need to handle those ourselves.
            const motionService = this.accessory.getService(this.hap.Service.MotionSensor);
            if (motionService) {
                // Update the state characteristics.
                this.configureStateCharacteristics(motionService);
            }
            enabledSensors.push("motion sensor");
        }
        // Configure the temperature sensor.
        if (this.configureTemperatureSensor()) {
            enabledSensors.push("temperature");
        }
        return enabledSensors;
    }
    // Configure the alarm sound sensor for HomeKit.
    configureAlarmSoundSensor() {
        var _a, _b;
        const device = this.accessory.context.device;
        // Find the service, if it exists.
        let contactService = this.accessory.getServiceById(this.hap.Service.ContactSensor, protect_accessory_1.ProtectReservedNames.CONTACT_SENSOR_ALARM_SOUND);
        // Have we disabled the alarm sound sensor?
        if (!((_a = device === null || device === void 0 ? void 0 : device.alarmSettings) === null || _a === void 0 ? void 0 : _a.isEnabled)) {
            if (contactService) {
                this.accessory.removeService(contactService);
                this.log.info("%s: Disabling alarm sound contact sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!contactService) {
            contactService = new this.hap.Service.ContactSensor(this.accessory.displayName + " Alarm Sound", protect_accessory_1.ProtectReservedNames.CONTACT_SENSOR_ALARM_SOUND);
            if (!contactService) {
                this.log.error("%s: Unable to add alarm sound contact sensor.", this.name());
                return false;
            }
            this.accessory.addService(contactService);
            this.log.info("%s: Enabling alarm sound contact sensor.", this.name());
        }
        // Retrieve the current contact sensor state when requested.
        (_b = contactService.getCharacteristic(this.hap.Characteristic.ContactSensorState)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            return this.getAlarmSound();
        });
        // Update the sensor.
        contactService.updateCharacteristic(this.hap.Characteristic.ContactSensorState, this.getAlarmSound());
        // Update the state characteristics.
        this.configureStateCharacteristics(contactService);
        return true;
    }
    // Configure the ambient light sensor for HomeKit.
    configureAmbientLightSensor() {
        var _a, _b;
        const device = this.accessory.context.device;
        // Find the service, if it exists.
        let lightService = this.accessory.getService(this.hap.Service.LightSensor);
        // Have we disabled the light sensor?
        if (!((_a = device === null || device === void 0 ? void 0 : device.lightSettings) === null || _a === void 0 ? void 0 : _a.isEnabled)) {
            if (lightService) {
                this.accessory.removeService(lightService);
                this.log.info("%s: Disabling ambient light sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!lightService) {
            lightService = new this.hap.Service.LightSensor(this.accessory.displayName);
            if (!lightService) {
                this.log.error("%s: Unable to add ambient light sensor.", this.name());
                return false;
            }
            this.accessory.addService(lightService);
            this.log.info("%s: Enabling ambient light sensor.", this.name());
        }
        // Retrieve the current light level when requested.
        (_b = lightService.getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            // The minimum value for ambient light in HomeKit is 0.0001. I have no idea why...but it is. Honor it.
            const value = this.getAmbientLight();
            return value >= 0.0001 ? value : 0.0001;
        });
        // Update the sensor. The minimum value for ambient light in HomeKit is 0.0001. I have no idea why...but it is. Honor it.
        const value = this.getAmbientLight();
        lightService.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, value >= 0.0001 ? value : 0.0001);
        // Update the state characteristics.
        this.configureStateCharacteristics(lightService);
        return true;
    }
    // Configure the contact sensor for HomeKit.
    configureContactSensor() {
        var _a;
        const device = this.accessory.context.device;
        // Find the service, if it exists.
        let contactService = this.accessory.getServiceById(this.hap.Service.ContactSensor, protect_accessory_1.ProtectReservedNames.CONTACT_SENSOR);
        // Have we disabled the sensor?
        if (!(device === null || device === void 0 ? void 0 : device.mountType) || (device.mountType === "none")) {
            if (contactService) {
                this.accessory.removeService(contactService);
                this.log.info("%s: Disabling contact sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!contactService) {
            contactService = new this.hap.Service.ContactSensor(this.accessory.displayName, protect_accessory_1.ProtectReservedNames.CONTACT_SENSOR);
            if (!contactService) {
                this.log.error("%s: Unable to add contact sensor.", this.name());
                return false;
            }
            this.accessory.addService(contactService);
            this.log.info("%s: Enabling contact sensor.", this.name());
        }
        // Retrieve the current contact sensor state when requested.
        (_a = contactService.getCharacteristic(this.hap.Characteristic.ContactSensorState)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
            return this.getContact();
        });
        // Update the sensor.
        contactService.updateCharacteristic(this.hap.Characteristic.ContactSensorState, this.getContact());
        // Update the state characteristics.
        this.configureStateCharacteristics(contactService);
        return true;
    }
    // Configure the humidity sensor for HomeKit.
    configureHumiditySensor() {
        var _a, _b;
        const device = this.accessory.context.device;
        // Find the service, if it exists.
        let humidityService = this.accessory.getService(this.hap.Service.HumiditySensor);
        // Have we disabled the sensor?
        if (!((_a = device === null || device === void 0 ? void 0 : device.humiditySettings) === null || _a === void 0 ? void 0 : _a.isEnabled)) {
            if (humidityService) {
                this.accessory.removeService(humidityService);
                this.log.info("%s: Disabling humidity sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!humidityService) {
            humidityService = new this.hap.Service.HumiditySensor(this.accessory.displayName);
            if (!humidityService) {
                this.log.error("%s: Unable to add humidity sensor.", this.name());
                return false;
            }
            this.accessory.addService(humidityService);
            this.log.info("%s: Enabling humidity sensor.", this.name());
        }
        // Retrieve the current humidity when requested.
        (_b = humidityService.getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            const value = this.getHumidity();
            return value < 0 ? 0 : value;
        });
        // Update the sensor.
        const value = this.getHumidity();
        humidityService.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, value < 0 ? 0 : value);
        // Update the state characteristics.
        this.configureStateCharacteristics(humidityService);
        return true;
    }
    // Configure the temperature sensor for HomeKit.
    configureTemperatureSensor() {
        var _a, _b;
        const device = this.accessory.context.device;
        // Find the service, if it exists.
        let temperatureService = this.accessory.getService(this.hap.Service.TemperatureSensor);
        // Have we disabled the temperature sensor?
        if (!((_a = device === null || device === void 0 ? void 0 : device.temperatureSettings) === null || _a === void 0 ? void 0 : _a.isEnabled)) {
            if (temperatureService) {
                this.accessory.removeService(temperatureService);
                this.log.info("%s: Disabling temperature sensor.", this.name());
            }
            return false;
        }
        // Add the service to the accessory, if needed.
        if (!temperatureService) {
            temperatureService = new this.hap.Service.TemperatureSensor(this.accessory.displayName);
            if (!temperatureService) {
                this.log.error("%s: Unable to add temperature sensor.", this.name());
                return false;
            }
            this.accessory.addService(temperatureService);
            this.log.info("%s: Enabling temperature sensor.", this.name());
        }
        // Retrieve the current temperature when requested.
        (_b = temperatureService.getCharacteristic(this.hap.Characteristic.CurrentTemperature)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            const value = this.getTemperature();
            return value < 0 ? 0 : value;
        });
        // Update the sensor.
        const value = this.getTemperature();
        temperatureService.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, value < 0 ? 0 : value);
        // Update the state characteristics.
        this.configureStateCharacteristics(temperatureService);
        return true;
    }
    // Configure the active connection status in HomeKit.
    configureActiveStatus(service) {
        var _a;
        const device = this.accessory.context.device;
        // Retrieve the current connection status when requested.
        (_a = service.getCharacteristic(this.hap.Characteristic.StatusActive)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
            return this.accessory.context.device.state === "CONNECTED";
        });
        // Update the current connection status.
        service.updateCharacteristic(this.hap.Characteristic.StatusActive, device.state === "CONNECTED");
        return true;
    }
    // Configure the battery status in HomeKit.
    configureBatteryStatus(service) {
        var _a, _b;
        const device = this.accessory.context.device;
        // Retrieve the current battery status when requested.
        (_a = service.getCharacteristic(this.hap.Characteristic.StatusLowBattery)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
            var _a;
            return (_a = this.accessory.context.device.batteryStatus) === null || _a === void 0 ? void 0 : _a.isLow;
        });
        // Update the battery status.
        service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, (_b = device.batteryStatus) === null || _b === void 0 ? void 0 : _b.isLow);
        return true;
    }
    // Configure the tamper status in HomeKit.
    configureTamperedStatus(service) {
        var _a;
        const device = this.accessory.context.device;
        // Retrieve the current tamper status when requested.
        (_a = service.getCharacteristic(this.hap.Characteristic.StatusTampered)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
            return this.accessory.context.device.tamperingDetectedAt !== null;
        });
        // Update the tamper status.
        service.updateCharacteristic(this.hap.Characteristic.StatusTampered, device.tamperingDetectedAt !== null);
        return true;
    }
    // Configure the additional state characteristics in HomeKit.
    configureStateCharacteristics(service) {
        // Update the active connection status.
        this.configureActiveStatus(service);
        // Update the battery status.
        this.configureBatteryStatus(service);
        // Update the tamper status.
        this.configureTamperedStatus(service);
        return true;
    }
    // Get the current alarm sound information.
    getAlarmSound() {
        var _a;
        // Return true if we are not null, meaning the alarm has sounded.
        const value = this.accessory.context.device.alarmTriggeredAt !== null;
        // Save the state change and publish to MQTT.
        if (value !== this.savedAlarmSound) {
            this.savedAlarmSound = value;
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(this.accessory, "alarmsound", value.toString());
        }
        return value;
    }
    // Get the current ambient light information.
    getAmbientLight() {
        var _a;
        return (_a = this.accessory.context.device.stats.light.value) !== null && _a !== void 0 ? _a : -1;
    }
    // Get the current contact sensor information.
    getContact() {
        var _a;
        // Return true if we are open.
        const value = this.accessory.context.device.isOpened;
        // Save the state change and publish to MQTT.
        if (value !== this.savedContact) {
            this.savedContact = value;
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(this.accessory, "contact", value.toString());
        }
        return value;
    }
    // Get the current humidity information.
    getHumidity() {
        var _a;
        return (_a = this.accessory.context.device.stats.humidity.value) !== null && _a !== void 0 ? _a : -1;
    }
    // Get the current temperature information.
    getTemperature() {
        var _a;
        return (_a = this.accessory.context.device.stats.temperature.value) !== null && _a !== void 0 ? _a : -1;
    }
    // Configure MQTT capabilities for sensors.
    configureMqtt() {
        var _a, _b, _c, _d, _e, _f;
        if (!((_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac)) {
            return;
        }
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribeGet(this.accessory, this.name(), "alarmsound", "Alarm sound", () => {
            return this.getAlarmSound().toString();
        });
        (_c = this.nvr.mqtt) === null || _c === void 0 ? void 0 : _c.subscribeGet(this.accessory, this.name(), "ambientlight", "Ambient light", () => {
            return this.getAmbientLight().toString();
        });
        (_d = this.nvr.mqtt) === null || _d === void 0 ? void 0 : _d.subscribeGet(this.accessory, this.name(), "contact", "Contact sensor", () => {
            return this.getContact().toString();
        });
        (_e = this.nvr.mqtt) === null || _e === void 0 ? void 0 : _e.subscribeGet(this.accessory, this.name(), "humidity", "Humidity", () => {
            return this.getHumidity().toString();
        });
        (_f = this.nvr.mqtt) === null || _f === void 0 ? void 0 : _f.subscribeGet(this.accessory, this.name(), "temperature", "Temperature", () => {
            return this.getTemperature().toString();
        });
    }
}
exports.ProtectSensor = ProtectSensor;
//# sourceMappingURL=protect-sensor.js.map