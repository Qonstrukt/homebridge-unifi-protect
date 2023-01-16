"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectLiveviews = void 0;
const settings_1 = require("./settings");
const protect_accessory_1 = require("./protect-accessory");
const protect_securitysystem_1 = require("./protect-securitysystem");
class ProtectLiveviews extends protect_accessory_1.ProtectBase {
    // Configure our liveviews capability.
    constructor(nvr) {
        var _a, _b;
        // Let the base class get us set up.
        super(nvr);
        // Initialize the class.
        this.isMqttConfigured = false;
        this.liveviews = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews;
        this.liveviewSwitches = [];
        this.securityAccessory = null;
        this.securitySystem = null;
    }
    // Update security system accessory.
    configureLiveviews() {
        var _a;
        // Do we have controller access?
        if (!((_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr)) {
            return;
        }
        this.liveviews = this.nvrApi.bootstrap.liveviews;
        this.configureSecuritySystem();
        this.configureSwitches();
        this.configureMqtt();
    }
    // Configure the security system accessory.
    configureSecuritySystem() {
        var _a;
        // If we don't have the bootstrap configuration, we're done here.
        if (!this.nvrApi.bootstrap) {
            return;
        }
        const regexSecuritySystemLiveview = /^Protect-(Away|Home|Night|Off)$/i;
        const uuid = this.hap.uuid.generate(this.nvrApi.bootstrap.nvr.mac + ".Security");
        // If the user removed the last Protect-centric liveview for the security system, we remove the security system accessory.
        if (!((_a = this.liveviews) === null || _a === void 0 ? void 0 : _a.some((x) => regexSecuritySystemLiveview.test(x.name)))) {
            if (this.securityAccessory) {
                this.log.info("%s: No plugin-specific liveviews found. Disabling the security system accessory associated with this UniFi Protect controller.", this.name());
                // Unregister the accessory and delete it's remnants from HomeKit and the plugin.
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.securityAccessory]);
                this.platform.accessories.splice(this.platform.accessories.indexOf(this.securityAccessory), 1);
            }
            this.securityAccessory = null;
            this.securitySystem = null;
            return;
        }
        // Create the security system accessory if it doesn't already exist.
        if (!this.securityAccessory) {
            // See if we already have this accessory defined.
            if ((this.securityAccessory = this.platform.accessories.find((x) => x.UUID === uuid)) === undefined) {
                // We will use the NVR MAC address + ".Security" to create our UUID. That should provide the guaranteed uniqueness we need.
                this.securityAccessory = new this.api.platformAccessory(this.nvrApi.bootstrap.nvr.name, uuid);
                // Register this accessory with homebridge and add it to the platform accessory array so we can track it.
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [this.securityAccessory]);
                this.platform.accessories.push(this.securityAccessory);
            }
            if (!this.securityAccessory) {
                this.log.error("%s: Unable to create the security system accessory.", this.name());
                return;
            }
            this.log.info("%s: Plugin-specific liveviews have been detected. Enabling the security system accessory.", this.name());
        }
        // We have the security system accessory, now let's configure it.
        if (!this.securitySystem) {
            this.securitySystem = new protect_securitysystem_1.ProtectSecuritySystem(this.nvr, this.securityAccessory);
            if (!this.securitySystem) {
                this.log.error("%s: Unable to configure the security system accessory.", this.name());
                return;
            }
        }
        // Update our NVR reference.
        this.securityAccessory.context.nvr = this.nvrApi.bootstrap.nvr.mac;
    }
    // Configure any liveview-associated switches.
    configureSwitches() {
        var _a;
        // If we don't have any liveviews or the bootstrap configuration, there's nothing to configure.
        if (!this.liveviews || !this.nvrApi.bootstrap) {
            return;
        }
        // Iterate through the list of switches and see if we still have matching liveviews.
        for (const liveviewSwitch of this.liveviewSwitches) {
            // We found a switch matching this liveview. Move along...
            if (this.liveviews.some((x) => { var _a; return x.name.toUpperCase() === ("Protect-" + ((_a = liveviewSwitch.context) === null || _a === void 0 ? void 0 : _a.liveview)).toUpperCase(); })) {
                continue;
            }
            // The switch has no associated liveview - let's get rid of it.
            this.log.info("%s: The plugin-specific liveview %s has been removed or renamed. Removing the switch associated with this liveview.", this.name(), liveviewSwitch.context.liveview);
            // Unregister the accessory and delete it's remnants from HomeKit and the plugin.
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [liveviewSwitch]);
            this.platform.accessories.splice(this.platform.accessories.indexOf(liveviewSwitch), 1);
            this.liveviewSwitches.splice(this.liveviewSwitches.indexOf(liveviewSwitch), 1);
        }
        // Initialize the regular expression here so we don't have to reinitialize it in each iteration below.
        const regexSecuritySystemLiveview = /^Protect-((?!Away$|Off$|Home$|Night$).+)$/i;
        // Check for any new plugin-specific liveviews.
        for (const liveview of this.liveviews) {
            // Only match on views beginning with Protect- that are not reserved for the security system.
            const viewMatch = regexSecuritySystemLiveview.exec(liveview.name);
            // No match found, we're not interested in it.
            if (!viewMatch) {
                continue;
            }
            // Grab the name of our new switch for reference.
            const viewName = viewMatch[1];
            // See if we already have this accessory defined.
            if (this.liveviewSwitches.some((x) => { var _a; return ((_a = x.context) === null || _a === void 0 ? void 0 : _a.liveview).toUpperCase() === viewName.toUpperCase(); })) {
                continue;
            }
            // We use the NVR MAC address + ".Liveview." + viewname to create our unique UUID for our switches.
            const uuid = this.hap.uuid.generate(this.nvrApi.bootstrap.nvr.mac + ".Liveview." + viewName.toUpperCase());
            // Check to see if the accessory already exists before we create it.
            let newAccessory;
            if ((newAccessory = this.platform.accessories.find((x) => x.UUID === uuid)) === undefined) {
                newAccessory = new this.api.platformAccessory(this.nvrApi.bootstrap.nvr.name + " " + viewName, uuid);
                // Register this accessory with homebridge and add it to the platform accessory array so we can track it.
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [newAccessory]);
                this.platform.accessories.push(newAccessory);
            }
            if (!newAccessory) {
                this.log.error("%s: Unable to create the switch for liveview: %s.", this.name(), viewName);
                return;
            }
            // Configure our accessory.
            newAccessory.context.liveview = viewName;
            newAccessory.context.nvr = this.nvrApi.bootstrap.nvr.mac;
            newAccessory.context.switchState = false;
            this.liveviewSwitches.push(newAccessory);
            // Find the existing liveview switch, if we have one.
            let switchService = newAccessory.getService(this.hap.Service.Switch);
            // Add the liveview switch to the accessory.
            if (!switchService) {
                switchService = new this.hap.Service.Switch(newAccessory.displayName);
                if (!switchService) {
                    this.log.error("%s: Unable to create the switch for liveview: %s.", this.name(), viewName);
                    return;
                }
                newAccessory.addService(switchService);
            }
            // Activate or deactivate motion detection.
            (_a = switchService
                .getCharacteristic(this.hap.Characteristic.On)) === null || _a === void 0 ? void 0 : _a.onGet(this.getSwitchState.bind(this, newAccessory)).onSet(this.setSwitchState.bind(this, newAccessory));
            // Initialize the switch.
            switchService.updateCharacteristic(this.hap.Characteristic.On, newAccessory.context.switchState);
            this.log.info("%s: Plugin-specific liveview %s has been detected. Configuring a switch accessory for it.", this.name(), viewName);
        }
    }
    // Configure MQTT capabilities for the security system.
    configureMqtt() {
        var _a, _b, _c, _d, _e;
        if (this.isMqttConfigured || !((_a = this.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac)) {
            return;
        }
        this.isMqttConfigured = true;
        // Return the current status of all the liveviews.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribe((_c = this.nvrApi.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr.mac, "liveviews/get", (message) => {
            var _a, _b, _c;
            const value = message.toString().toLowerCase();
            // When we get the right message, we return the list of liveviews.
            if (value !== "true") {
                return;
            }
            // Get the list of liveviews.
            const liveviews = this.liveviewSwitches.map(x => { var _a; return ({ name: x.context.liveview, state: (_a = x.getService(this.hap.Service.Switch)) === null || _a === void 0 ? void 0 : _a.getCharacteristic(this.hap.Characteristic.On).value }); });
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish((_c = (_b = this.nvrApi.bootstrap) === null || _b === void 0 ? void 0 : _b.nvr.mac) !== null && _c !== void 0 ? _c : "", "liveviews", JSON.stringify(liveviews));
            this.log.info("%s: Liveview scenes list published via MQTT.", this.name());
        });
        // Set the status of one or more liveviews.
        (_d = this.nvr.mqtt) === null || _d === void 0 ? void 0 : _d.subscribe((_e = this.nvrApi.bootstrap) === null || _e === void 0 ? void 0 : _e.nvr.mac, "liveviews/set", (message) => {
            var _a;
            let incomingPayload;
            // Catch any errors in parsing what we get over MQTT.
            try {
                incomingPayload = JSON.parse(message.toString());
                // Sanity check what comes in from MQTT to make sure it's what we want.
                if (!(incomingPayload instanceof Array)) {
                    throw new Error("The JSON object is not in the expected format");
                }
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    this.log.error("%s: Unable to process MQTT liveview setting: \"%s\". Error: %s.", this.name(), message.toString(), error.message);
                }
                else {
                    this.log.error("%s: Unknown error has occurred: %s.", this.name(), error);
                }
                // Errors mean that we're done now.
                return;
            }
            // Update state on the liveviews.
            for (const entry of incomingPayload) {
                // Lookup this liveview.
                const accessory = this.liveviewSwitches.find((x) => { var _a, _b, _c; return ((_b = (_a = x.context) === null || _a === void 0 ? void 0 : _a.liveview) !== null && _b !== void 0 ? _b : "").toUpperCase() === ((_c = entry.name) === null || _c === void 0 ? void 0 : _c.toUpperCase()); });
                // If we can't find it, move on.
                if (!accessory) {
                    continue;
                }
                // Set the switch state and update the switch in HomeKit.
                this.setSwitchState(accessory, entry.state);
                (_a = accessory.getService(this.hap.Service.Switch)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.On, accessory.context.switchState);
                this.log.info("%s: Liveview scene updated via MQTT: %s.", this.name(), accessory.context.liveview);
            }
        });
    }
    // Get the current liveview switch state.
    getSwitchState(accessory) {
        return accessory.context.switchState === true;
    }
    // Toggle the liveview switch state.
    setSwitchState(liveviewSwitch, value) {
        var _a, _b, _c, _d;
        // We don't have any liveviews or we're already at this state - we're done.
        if (!this.nvrApi.bootstrap || !this.liveviews || (liveviewSwitch.context.switchState === value)) {
            return;
        }
        // Get the complete list of cameras in the liveview we're interested in.
        // This cryptic line grabs the list of liveviews that have the name we're interested in
        // (turns out, you can define multiple liveviews in Protect with the same name...who knew!),
        // and then create a single list containing all of the cameras found.
        const targetCameraIds = this.liveviews.filter(view => view.name.toUpperCase() === ("Protect-" + liveviewSwitch.context.liveview).toUpperCase())
            .map(view => view.slots.map(slots => slots.cameras))
            .flat(2);
        // Nothing configured for this view. We're done.
        if (!targetCameraIds.length) {
            return;
        }
        // Iterate through the list of accessories and set the Protect scene.
        for (const targetAccessory of this.platform.accessories) {
            // We only want accessories associated with this Protect controller.
            if (!((_a = targetAccessory.context) === null || _a === void 0 ? void 0 : _a.device) || targetAccessory.context.nvr !== this.nvrApi.bootstrap.nvr.mac) {
                continue;
            }
            // Check to see if this is one of the cameras we want to toggle motion detection for and the state is changing.
            if (targetCameraIds.some(thisCameraId => thisCameraId === targetAccessory.context.device.id) && (targetAccessory.context.detectMotion !== value)) {
                targetAccessory.context.detectMotion = value;
                // Update the switch service, if present.
                const motionSwitch = targetAccessory.getService(this.hap.Service.Switch);
                if (motionSwitch) {
                    motionSwitch.updateCharacteristic(this.hap.Characteristic.On, targetAccessory.context.detectMotion);
                }
                this.log.info("%s: %s -> %s: Motion detection %s.", this.name(), liveviewSwitch.context.liveview, targetAccessory.displayName, targetAccessory.context.detectMotion === true ? "enabled" : "disabled");
            }
        }
        liveviewSwitch.context.switchState = value === true;
        // Publish to MQTT, if configured.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.publish((_d = (_c = this.nvrApi.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr.mac) !== null && _d !== void 0 ? _d : "", "liveviews", JSON.stringify([{ name: liveviewSwitch.context.liveview, state: liveviewSwitch.context.switchState }]));
    }
}
exports.ProtectLiveviews = ProtectLiveviews;
//# sourceMappingURL=protect-liveviews.js.map