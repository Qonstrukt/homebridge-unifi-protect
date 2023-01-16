"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectAccessory = exports.ProtectBase = exports.ProtectReservedNames = void 0;
var ProtectReservedNames;
(function (ProtectReservedNames) {
    // Manage our contact sensor types.
    ProtectReservedNames["CONTACT_MOTION_SMARTDETECT"] = "ContactMotionSmartDetect";
    ProtectReservedNames["CONTACT_SENSOR"] = "ContactSensor";
    ProtectReservedNames["CONTACT_SENSOR_ALARM_SOUND"] = "ContactAlarmSound";
    // Manage our switch types.
    ProtectReservedNames["SWITCH_DOORBELL_TRIGGER"] = "DoorbellTrigger";
    ProtectReservedNames["SWITCH_DYNAMIC_BITRATE"] = "DynamicBitrate";
    ProtectReservedNames["SWITCH_HKSV_RECORDING"] = "HKSVRecordingSwitch";
    ProtectReservedNames["SWITCH_MOTION_SENSOR"] = "MotionSensorSwitch";
    ProtectReservedNames["SWITCH_MOTION_TRIGGER"] = "MotionSensorTrigger";
    ProtectReservedNames["SWITCH_UFP_RECORDING_ALWAYS"] = "UFPRecordingSwitch.always";
    ProtectReservedNames["SWITCH_UFP_RECORDING_DETECTIONS"] = "UFPRecordingSwitch.detections";
    ProtectReservedNames["SWITCH_UFP_RECORDING_NEVER"] = "UFPRecordingSwitch.never";
})(ProtectReservedNames = exports.ProtectReservedNames || (exports.ProtectReservedNames = {}));
class ProtectBase {
    // The constructor initializes key variables and calls configureDevice().
    constructor(nvr) {
        this.api = nvr.platform.api;
        this.debug = nvr.platform.debug.bind(this);
        this.hap = this.api.hap;
        this.log = nvr.platform.log;
        this.nvr = nvr;
        this.nvrApi = nvr.nvrApi;
        this.platform = nvr.platform;
    }
    // Configure the device device information for HomeKit.
    setInfo(accessory, device) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        // If we don't have a device, we're done.
        if (!device) {
            return false;
        }
        // Update the manufacturer information for this device.
        (_a = accessory
            .getService(this.hap.Service.AccessoryInformation)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.Manufacturer, "Ubiquiti Networks");
        // Update the model information for this device.
        if ((_b = device.type) === null || _b === void 0 ? void 0 : _b.length) {
            (_c = accessory
                .getService(this.hap.Service.AccessoryInformation)) === null || _c === void 0 ? void 0 : _c.updateCharacteristic(this.hap.Characteristic.Model, device.type);
        }
        // Update the serial number for this device.
        if ((_d = device.mac) === null || _d === void 0 ? void 0 : _d.length) {
            (_e = accessory
                .getService(this.hap.Service.AccessoryInformation)) === null || _e === void 0 ? void 0 : _e.updateCharacteristic(this.hap.Characteristic.SerialNumber, device.mac);
        }
        // Update the hardware revision for this device, if available.
        if ((_f = device.hardwareRevision) === null || _f === void 0 ? void 0 : _f.length) {
            (_g = accessory
                .getService(this.hap.Service.AccessoryInformation)) === null || _g === void 0 ? void 0 : _g.updateCharacteristic(this.hap.Characteristic.HardwareRevision, device.hardwareRevision);
        }
        // Update the firmware revision for this device.
        if ((_h = device.firmwareVersion) === null || _h === void 0 ? void 0 : _h.length) {
            (_j = accessory
                .getService(this.hap.Service.AccessoryInformation)) === null || _j === void 0 ? void 0 : _j.updateCharacteristic(this.hap.Characteristic.FirmwareRevision, device.firmwareVersion);
        }
        return true;
    }
    // Utility function to return the fully enumerated name of this camera.
    name() {
        return this.nvr.nvrApi.getNvrName();
    }
}
exports.ProtectBase = ProtectBase;
class ProtectAccessory extends ProtectBase {
    // The constructor initializes key variables and calls configureDevice().
    constructor(nvr, accessory) {
        // Call the constructor of our base class.
        super(nvr);
        // Set the accessory.
        this.accessory = accessory;
        // Configure the device.
        void this.configureDevice();
    }
    // Configure the device device information for HomeKit.
    configureInfo() {
        return this.setInfo(this.accessory, this.accessory.context.device);
    }
    // Configure the Protect motion sensor for HomeKit.
    configureMotionSensor(isEnabled = true) {
        var _a, _b;
        const device = this.accessory.context.device;
        // Find the motion sensor service, if it exists.
        let motionService = this.accessory.getService(this.hap.Service.MotionSensor);
        // Have we disabled motion sensors?
        if (!isEnabled || !((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(device, "Motion.Sensor"))) {
            if (motionService) {
                this.accessory.removeService(motionService);
                (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.unsubscribe(this.accessory, "motion/trigger");
                this.log.info("%s: Disabling motion sensor.", this.name());
            }
            return false;
        }
        // We don't have a motion sensor, let's add it to the camera.
        if (!motionService) {
            // We don't have it, add the motion sensor to the camera.
            motionService = new this.hap.Service.MotionSensor(this.accessory.displayName);
            if (!motionService) {
                this.log.error("%s: Unable to add motion sensor.", this.name());
                return false;
            }
            this.accessory.addService(motionService);
            this.log.info("%s: Enabling motion sensor.", this.name());
        }
        // Initialize the state of the motion sensor.
        motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
        motionService.updateCharacteristic(this.hap.Characteristic.StatusActive, device.state === "CONNECTED");
        motionService.getCharacteristic(this.hap.Characteristic.StatusActive).onGet(() => {
            return this.accessory.context.device.state === "CONNECTED";
        });
        this.configureMqttMotionTrigger();
        return true;
    }
    // Configure a switch to easily activate or deactivate motion sensor detection for HomeKit.
    configureMotionSwitch() {
        var _a, _b, _c;
        // Find the switch service, if it exists.
        let switchService = this.accessory.getServiceById(this.hap.Service.Switch, ProtectReservedNames.SWITCH_MOTION_SENSOR);
        // Have we disabled motion sensors or the motion switch? Motion switches are disabled by default.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Motion.Sensor")) ||
            !((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Motion.Switch", false))) {
            if (switchService) {
                this.accessory.removeService(switchService);
            }
            // If we disable the switch, make sure we fully reset it's state.
            this.accessory.context.detectMotion = true;
            return false;
        }
        this.log.info("%s: Enabling motion sensor switch.", this.name());
        // Add the switch to the camera, if needed.
        if (!switchService) {
            switchService = new this.hap.Service.Switch(this.accessory.displayName + " Motion Events", ProtectReservedNames.SWITCH_MOTION_SENSOR);
            if (!switchService) {
                this.log.error("%s: Unable to add motion sensor switch.", this.name());
                return false;
            }
            this.accessory.addService(switchService);
        }
        // Activate or deactivate motion detection.
        (_c = switchService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _c === void 0 ? void 0 : _c.onGet(() => {
            return this.accessory.context.detectMotion === true;
        }).onSet((value) => {
            if (this.accessory.context.detectMotion !== value) {
                this.log.info("%s: Motion detection %s.", this.name(), (value === true) ? "enabled" : "disabled");
            }
            this.accessory.context.detectMotion = value === true;
        });
        // Initialize the switch.
        switchService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.detectMotion);
        return true;
    }
    // Configure MQTT motion triggers.
    configureMqttMotionTrigger() {
        var _a;
        // Trigger a motion event in MQTT, if requested to do so.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "motion/trigger", (message) => {
            const value = message.toString();
            // When we get the right message, we trigger the motion event.
            if ((value === null || value === void 0 ? void 0 : value.toLowerCase()) !== "true") {
                return;
            }
            // Trigger the motion event.
            this.nvr.events.motionEventHandler(this.accessory, Date.now());
            this.log.info("%s: Motion event triggered via MQTT.", this.name());
        });
        return true;
    }
    // Utility function for reserved identifiers for switches.
    isReservedName(name) {
        return name === undefined ? false : Object.values(ProtectReservedNames).map(x => x.toUpperCase()).includes(name.toUpperCase());
    }
    // Utility function to return the fully enumerated name of this camera.
    name() {
        var _a;
        return this.nvr.nvrApi.getFullName((_a = this.accessory.context.device) !== null && _a !== void 0 ? _a : null);
    }
}
exports.ProtectAccessory = ProtectAccessory;
//# sourceMappingURL=protect-accessory.js.map