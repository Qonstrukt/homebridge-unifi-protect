"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectSecuritySystem = void 0;
/* Copyright(C) 2019-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-securitysystem.ts: Security system accessory for UniFi Protect.
 */
const protect_accessory_1 = require("./protect-accessory");
class ProtectSecuritySystem extends protect_accessory_1.ProtectAccessory {
    // Configure a security system accessory for HomeKit.
    configureDevice() {
        var _a;
        const accessory = this.accessory;
        let securityState = this.hap.Characteristic.SecuritySystemCurrentState.STAY_ARM;
        // Save the security system state before we wipeout the context.
        if (accessory.context.securityState !== undefined) {
            securityState = accessory.context.securityState;
        }
        // Clean out the context object in case it's been polluted somehow.
        accessory.context = {};
        accessory.context.nvr = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
        accessory.context.securityState = securityState;
        // Configure accessory information.
        this.configureInfo();
        // Configure MQTT services.
        this.configureMqtt();
        // Configure the security system service.
        this.configureSecuritySystem();
        // Configure the security alarm.
        this.configureSecurityAlarm();
        return Promise.resolve(true);
    }
    // Configure the security system device information for HomeKit.
    configureInfo() {
        var _a, _b, _c, _d;
        const accessory = this.accessory;
        const hap = this.hap;
        let nvrInfo;
        if (this.nvr && this.nvr.nvrApi && this.nvr.nvrApi.bootstrap && this.nvr.nvrApi.bootstrap.nvr) {
            nvrInfo = this.nvr.nvrApi.bootstrap.nvr;
        }
        // Update the manufacturer information for this security system.
        (_a = accessory
            .getService(hap.Service.AccessoryInformation)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(hap.Characteristic.Manufacturer, "github.com/hjdhjd");
        // Update the model information for this security system.
        (_b = accessory
            .getService(hap.Service.AccessoryInformation)) === null || _b === void 0 ? void 0 : _b.updateCharacteristic(hap.Characteristic.Model, "UniFi Protect Liveview Security System");
        if (nvrInfo) {
            // Update the serial number for this security system - we base this off of the NVR.
            (_c = accessory
                .getService(hap.Service.AccessoryInformation)) === null || _c === void 0 ? void 0 : _c.updateCharacteristic(hap.Characteristic.SerialNumber, nvrInfo.mac + ".Security");
            // Update the hardware revision for this security system - we base this off of the NVR.
            (_d = accessory
                .getService(hap.Service.AccessoryInformation)) === null || _d === void 0 ? void 0 : _d.updateCharacteristic(hap.Characteristic.HardwareRevision, nvrInfo.hardwareRevision);
        }
        return true;
    }
    // Configure MQTT capabilities for the security system.
    configureMqtt() {
        var _a, _b;
        // Get the current status of the security system.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "securitysystem/get", (message) => {
            const value = message.toString().toLowerCase();
            // When we get the right message, we return the state of the security system.
            if (value !== "true") {
                return;
            }
            // Publish the current status of the security system.
            this.publishSecurityState();
            this.log.info("%s: Security system status published via MQTT.", this.name());
        });
        // Set the security system state.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribe(this.accessory, "securitysystem/set", (message) => {
            var _a;
            const SecuritySystemCurrentState = this.hap.Characteristic.SecuritySystemCurrentState;
            const SecuritySystemTargetState = this.hap.Characteristic.SecuritySystemTargetState;
            const value = message.toString().toLowerCase();
            let alarmState;
            let targetState;
            // Map the request to our security states.
            switch (value) {
                case "home":
                    targetState = SecuritySystemTargetState.STAY_ARM;
                    break;
                case "away":
                    targetState = SecuritySystemTargetState.AWAY_ARM;
                    break;
                case "night":
                    targetState = SecuritySystemTargetState.NIGHT_ARM;
                    break;
                case "alarmoff":
                    targetState = SecuritySystemCurrentState.ALARM_TRIGGERED;
                    alarmState = false;
                    break;
                case "alarmon":
                    targetState = SecuritySystemCurrentState.ALARM_TRIGGERED;
                    alarmState = true;
                    break;
                case "off":
                    targetState = SecuritySystemTargetState.DISARM;
                    break;
                default:
                    // The user sent a bad value. Ignore it and we're done.
                    this.log.error("%s: Unable to process MQTT security system setting: %s.", this.name(), message.toString());
                    return;
            }
            // The security alarm gets handled differently than the other state settings.
            if (targetState === SecuritySystemCurrentState.ALARM_TRIGGERED) {
                this.setSecurityAlarm(alarmState);
                this.log.info("%s: Security alarm %s via MQTT.", this.name(), alarmState ? "triggered" : "reset");
                return;
            }
            // Set the security state, and we're done.
            (_a = this.accessory.getService(this.hap.Service.SecuritySystem)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(SecuritySystemTargetState, targetState);
            this.setSecurityState(targetState);
            this.log.info("%s: Security system state set via MQTT: %s.", this.name(), value.charAt(0).toUpperCase() + value.slice(1));
        });
        return true;
    }
    // Configure the security system for HomeKit.
    configureSecuritySystem() {
        var _a, _b, _c;
        const accessory = this.accessory;
        const hap = this.hap;
        // Find any existing security system service.
        let securityService = accessory.getService(hap.Service.SecuritySystem);
        // Add the security system service, if needed.
        if (!securityService) {
            securityService = new hap.Service.SecuritySystem(accessory.displayName);
            if (!securityService) {
                this.log.error("%s: Unable to add security system.", this.name());
                return false;
            }
            accessory.addService(securityService);
        }
        const SecuritySystemCurrentState = this.hap.Characteristic.SecuritySystemCurrentState;
        const SecuritySystemTargetState = this.hap.Characteristic.SecuritySystemTargetState;
        let targetSecurityState;
        switch (accessory.context.securityState) {
            case SecuritySystemCurrentState.STAY_ARM:
                targetSecurityState = SecuritySystemTargetState.STAY_ARM;
                break;
            case SecuritySystemCurrentState.AWAY_ARM:
                targetSecurityState = SecuritySystemTargetState.AWAY_ARM;
                break;
            case SecuritySystemCurrentState.NIGHT_ARM:
                targetSecurityState = SecuritySystemTargetState.NIGHT_ARM;
                break;
            case SecuritySystemCurrentState.DISARMED:
            default:
                targetSecurityState = SecuritySystemTargetState.DISARM;
                break;
        }
        // Handlers to get our current state, and initialize on startup.
        (_a = securityService
            .updateCharacteristic(SecuritySystemCurrentState, accessory.context.securityState)
            .getCharacteristic(SecuritySystemCurrentState)) === null || _a === void 0 ? void 0 : _a.onGet(this.getSecurityState.bind(this));
        // Handlers for triggering a change in the security system state.
        (_b = accessory.getService(hap.Service.SecuritySystem)) === null || _b === void 0 ? void 0 : _b.getCharacteristic(SecuritySystemTargetState).onSet(this.setSecurityState.bind(this));
        // Set the initial state after we have setup our handlers above. This way, when we startup, we
        // automatically restore the scene we've been set to, if any.
        (_c = accessory.getService(hap.Service.SecuritySystem)) === null || _c === void 0 ? void 0 : _c.updateCharacteristic(SecuritySystemTargetState, targetSecurityState);
        return true;
    }
    // Configure the security alarm for HomeKit.
    configureSecurityAlarm() {
        var _a, _b;
        this.isAlarmTriggered = false;
        // Find the existing security alarm switch service.
        let switchService = this.accessory.getService(this.hap.Service.Switch);
        // Have we enabled the security system alarm?
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(null, "SecuritySystem.Alarm", false))) {
            if (switchService) {
                this.accessory.removeService(switchService);
            }
            return false;
        }
        // Add the security alarm switch to the security system.
        if (!switchService) {
            switchService = new this.hap.Service.Switch(this.accessory.displayName + " Security Alarm");
            if (!switchService) {
                this.log.error("%s: Unable to add security system alarm.", this.name());
                return false;
            }
            this.accessory.addService(switchService);
        }
        // Notify the user that we're enabled.
        this.log.info("%s: Enabling the security alarm switch on the security system accessory.", this.name());
        // Activate or deactivate the security alarm.
        (_b = switchService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            return this.isAlarmTriggered === true;
        }).onSet((value) => {
            this.setSecurityAlarm(value === true);
            this.log.info("%s: Security system alarm %s.", this.name(), (value === true) ? "triggered" : "reset");
        });
        // Initialize the value.
        switchService.updateCharacteristic(this.hap.Characteristic.On, this.isAlarmTriggered);
        return true;
    }
    // Publish the security system state to MQTT.
    publishSecurityState() {
        var _a;
        const SecuritySystemCurrentState = this.hap.Characteristic.SecuritySystemCurrentState;
        let state;
        switch (this.accessory.context.securityState) {
            case SecuritySystemCurrentState.STAY_ARM:
                state = "Home";
                break;
            case SecuritySystemCurrentState.AWAY_ARM:
                state = "Away";
                break;
            case SecuritySystemCurrentState.NIGHT_ARM:
                state = "Night";
                break;
            case SecuritySystemCurrentState.ALARM_TRIGGERED:
                state = "Alarm";
                break;
            case SecuritySystemCurrentState.DISARMED:
            default:
                state = "Off";
                break;
        }
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(this.accessory, "securitysystem", this.isAlarmTriggered ? "Alarm" : state);
    }
    // Get the current security system state.
    getSecurityState() {
        return this.isAlarmTriggered ?
            this.hap.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED :
            this.accessory.context.securityState;
    }
    // Change the security system state, and enable or disable motion detection accordingly.
    setSecurityState(value) {
        var _a, _b, _c, _d, _e, _f;
        const accessory = this.accessory;
        const hap = this.hap;
        const liveviews = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.liveviews;
        let newState;
        const nvrApi = this.nvr.nvrApi;
        const SecuritySystemCurrentState = hap.Characteristic.SecuritySystemCurrentState;
        const SecuritySystemTargetState = hap.Characteristic.SecuritySystemTargetState;
        let viewScene = "";
        // If we don't have any liveviews or the bootstrap configuration, there's nothing for us to do.
        if (!liveviews || !nvrApi.bootstrap) {
            return;
        }
        // We have three different states which can be triggered (aside from disarming).
        // Those states are home, away, and night. We use this as a convenient way to easily enable or disable motion detection
        // on a Protect controller and effectively give us scene-type functionality in a nice way.
        switch (value) {
            case SecuritySystemTargetState.STAY_ARM:
                newState = SecuritySystemCurrentState.STAY_ARM;
                viewScene = "Protect-Home";
                break;
            case SecuritySystemTargetState.AWAY_ARM:
                newState = SecuritySystemCurrentState.AWAY_ARM;
                viewScene = "Protect-Away";
                break;
            case SecuritySystemTargetState.NIGHT_ARM:
                newState = SecuritySystemCurrentState.NIGHT_ARM;
                viewScene = "Protect-Night";
                break;
            case SecuritySystemTargetState.DISARM:
                newState = SecuritySystemCurrentState.DISARMED;
                viewScene = "Protect-Off";
                break;
            default:
                newState = SecuritySystemCurrentState.DISARMED;
                break;
        }
        // Get the complete list of cameras in the liveview we're interested in.
        // This cryptic line grabs the list of liveviews that have the name we're interested in
        // (turns out, you can define multiple liveviews in Protect with the same name...who knew!),
        // and then create a single list containing all of the cameras found.
        const targetCameraIds = liveviews.filter(view => view.name === viewScene)
            .map(view => view.slots.map(slots => slots.cameras))
            .flat(2);
        // We don't have a liveview for this state and we aren't disarming - update state for the user and we're done.
        if (newState !== SecuritySystemCurrentState.DISARMED && !targetCameraIds.length) {
            this.log.info("%s: No liveview configured for this security system state. Create a liveview named %s in the Protect webUI to use this feature.", this.name(), viewScene);
            accessory.context.securityState = newState;
            (_b = accessory.getService(hap.Service.SecuritySystem)) === null || _b === void 0 ? void 0 : _b.updateCharacteristic(SecuritySystemCurrentState, newState);
            return;
        }
        this.log.info("%s: Setting the liveview scene: %s.", this.name(), viewScene);
        // Iterate through the list of accessories and set the Protect scene.
        for (const targetAccessory of this.platform.accessories) {
            // We only want accessories associated with this Protect controller.
            if (!((_c = targetAccessory.context) === null || _c === void 0 ? void 0 : _c.device) || targetAccessory.context.nvr !== nvrApi.bootstrap.nvr.mac) {
                continue;
            }
            let targetState = false;
            // If we're disarming, then all Protect cameras will disable motion detection in HomeKit. Otherwise,
            // check to see if this is one of the cameras we want to turn on motion detection for.
            if (((newState !== SecuritySystemCurrentState.DISARMED) ||
                ((newState === SecuritySystemCurrentState.DISARMED) && targetCameraIds.length)) &&
                targetCameraIds.some(thisCameraId => thisCameraId === targetAccessory.context.device.id)) {
                targetState = true;
            }
            // Only take action to change motion detection state if needed.
            if (targetAccessory.context.detectMotion !== targetState) {
                targetAccessory.context.detectMotion = targetState;
                // Update the switch service, if present.
                const motionSwitch = targetAccessory.getServiceById(hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_SENSOR);
                if (motionSwitch) {
                    motionSwitch.updateCharacteristic(hap.Characteristic.On, targetAccessory.context.detectMotion);
                }
                this.log.info("%s: %s -> %s: Motion detection %s.", this.name(), viewScene, targetAccessory.displayName, targetAccessory.context.detectMotion === true ? "enabled" : "disabled");
            }
        }
        // Inform the user of our new state.
        accessory.context.securityState = newState;
        (_d = accessory.getService(hap.Service.SecuritySystem)) === null || _d === void 0 ? void 0 : _d.updateCharacteristic(SecuritySystemCurrentState, newState);
        // Reset our alarm state and update our alarm switch.
        this.isAlarmTriggered = false;
        if (((_e = accessory.getService(hap.Service.Switch)) === null || _e === void 0 ? void 0 : _e.getCharacteristic(hap.Characteristic.On).value) !== this.isAlarmTriggered) {
            (_f = accessory.getService(hap.Service.Switch)) === null || _f === void 0 ? void 0 : _f.updateCharacteristic(hap.Characteristic.On, this.isAlarmTriggered);
        }
        // Publish to MQTT, if configured.
        this.publishSecurityState();
    }
    // Set the security alarm.
    setSecurityAlarm(value) {
        var _a, _b;
        // Nothing to do.
        if (this.isAlarmTriggered === value) {
            return;
        }
        // Update the alarm state.
        this.isAlarmTriggered = value === true;
        // Update the security system state.
        (_a = this.accessory.getService(this.hap.Service.SecuritySystem)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.SecuritySystemCurrentState, this.isAlarmTriggered ? this.hap.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED : this.accessory.context.securityState);
        // Update the security alarm state.
        (_b = this.accessory.getService(this.hap.Service.Switch)) === null || _b === void 0 ? void 0 : _b.updateCharacteristic(this.hap.Characteristic.On, this.isAlarmTriggered);
        // Publish to MQTT, if configured.
        this.publishSecurityState();
    }
}
exports.ProtectSecuritySystem = ProtectSecuritySystem;
//# sourceMappingURL=protect-securitysystem.js.map