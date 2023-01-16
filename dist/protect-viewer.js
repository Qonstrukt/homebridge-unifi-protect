"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectViewer = void 0;
const protect_accessory_1 = require("./protect-accessory");
class ProtectViewer extends protect_accessory_1.ProtectAccessory {
    // Initialize and configure the viewer accessory for HomeKit.
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
        const enabledLiveviews = this.updateDevice(true);
        // Configure MQTT services.
        this.configureMqtt();
        // Inform the user what we're enabling on startup.
        if (enabledLiveviews.length) {
            this.log.info("%s: Configured liveview%s: %s.", this.name(), enabledLiveviews.length > 1 ? "s" : "", enabledLiveviews.join(", "));
        }
        else {
            this.log.info("%s: No liveviews configured.", this.name());
        }
        return Promise.resolve(true);
    }
    // Update accessory services and characteristics.
    updateDevice(configureHandlers = false) {
        var _a, _b, _c, _d;
        // Grab the current list of liveview switches we know about.
        const currentLiveviewSwitches = this.accessory.services.filter(x => (x.UUID === this.hap.Service.Switch.UUID) && x.subtype);
        // Grab the current list of liveview identifiers from Protect.
        const nvrLiveviewIds = (_c = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews) === null || _c === void 0 ? void 0 : _c.map(x => x.id);
        // Identify what's been removed on the NVR and remove it from the accessory as well.
        currentLiveviewSwitches.filter(x => { var _a; return !(nvrLiveviewIds === null || nvrLiveviewIds === void 0 ? void 0 : nvrLiveviewIds.includes((_a = x.subtype) !== null && _a !== void 0 ? _a : "")); }).map(x => this.accessory.removeService(x));
        // Identify what needs to be added to HomeKit that isn't already there, and add them.
        this.addLiveviewSwitch((_d = nvrLiveviewIds === null || nvrLiveviewIds === void 0 ? void 0 : nvrLiveviewIds.filter(x => !currentLiveviewSwitches.filter(liveviewSwitch => liveviewSwitch.subtype === x).length)) !== null && _d !== void 0 ? _d : []);
        // Finally, reflect the state of the liveview that's currently enabled.
        // Loop through the list of services on our viewer accessory and sync the liveview switches.
        this.updateLiveviewSwitchState(configureHandlers);
        // Return a list of our available liveviews for this device.
        return this.accessory.services.filter(x => (x.UUID === this.hap.Service.Switch.UUID) && x.subtype).map(x => x.displayName);
    }
    // Update the state of liveview switches for viewer devices.
    updateLiveviewSwitchState(configureHandlers = false) {
        for (const switchService of this.accessory.services) {
            // We only want to look at switches.
            if (switchService.UUID !== this.hap.Service.Switch.UUID) {
                continue;
            }
            // We only want switches with subtypes.
            if (!switchService.subtype) {
                continue;
            }
            // Configure the switch and update the state.
            this.configureLiveviewSwitch(switchService, configureHandlers);
        }
        return true;
    }
    // Configure the state and handlers of a liveview switch.
    configureLiveviewSwitch(switchService, configureHandlers = true) {
        var _a;
        // If we're configuring a switch for the first time, we add our respective handlers.
        if (configureHandlers) {
            // Turn the liveview switch on or off.
            (_a = switchService.getCharacteristic(this.hap.Characteristic.On)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
                return this.getLiveviewSwitchState(switchService);
            }).onSet((value) => {
                return this.setLiveviewSwitchState(switchService, value);
            });
        }
        // Set the state to reflect Protect.
        switchService.updateCharacteristic(this.hap.Characteristic.On, switchService.subtype === this.accessory.context.device.liveview);
        return true;
    }
    // Return the current state of the liveview switch.
    getLiveviewSwitchState(switchService) {
        return (this.accessory.context.device.liveview !== null) &&
            (this.accessory.context.device.liveview === switchService.subtype);
    }
    // Set the current state of the liveview switch.
    async setLiveviewSwitchState(switchService, value) {
        const viewState = value === true ? switchService.subtype : null;
        const newDevice = await this.setViewer(viewState);
        if (!newDevice) {
            if (viewState) {
                this.log.error("%s: Unable to set the liveview to: %s.", this.name(), switchService.displayName);
            }
            else {
                this.log.error("%s: Unable to clear the liveview.", this.name());
            }
            return;
        }
        // Set the context to our updated device configuration.
        this.accessory.context.device = newDevice;
        // Update all the other liveview switches.
        this.updateLiveviewSwitchState();
    }
    // Add liveview switches to HomeKit for viewer devices.
    addLiveviewSwitch(newLiveviewIds) {
        var _a, _b, _c, _d;
        // Loop through the list of liveview identifiers and add them to HomeKit as switches.
        for (const liveviewId of newLiveviewIds) {
            // Empty or invalid liveview identifier.
            if (!liveviewId) {
                continue;
            }
            // Retrieve the name assigned to this liveview.
            const liveviewName = (_d = (_c = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews) === null || _c === void 0 ? void 0 : _c.find(x => x.id === liveviewId)) === null || _d === void 0 ? void 0 : _d.name;
            // Grab the switch service associated with this liveview.
            const switchService = new this.hap.Service.Switch(liveviewName, liveviewId);
            if (!switchService) {
                this.log.error("%s: Unable to add liveview switch for %s.", this.name(), liveviewName);
                continue;
            }
            this.accessory.addService(switchService);
            this.configureLiveviewSwitch(switchService);
        }
        return true;
    }
    // Set the liveview on a viewer device in UniFi Protect.
    async setViewer(newLiveview) {
        var _a, _b, _c, _d;
        // Set the liveview.
        const newDevice = (await this.nvr.nvrApi.updateViewer(this.accessory.context.device, { liveview: newLiveview }));
        // Find the liveview name for MQTT.
        const liveview = (_c = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews) === null || _c === void 0 ? void 0 : _c.find(x => x.id === newLiveview);
        // Publish an MQTT event.
        if (liveview) {
            (_d = this.nvr.mqtt) === null || _d === void 0 ? void 0 : _d.publish(this.accessory, "liveview", liveview.name);
        }
        return newDevice;
    }
    // Configure MQTT capabilities of this viewer.
    configureMqtt() {
        var _a, _b;
        // Trigger a motion event in MQTT, if requested to do so.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "liveview/set", (message) => {
            var _a, _b, _c;
            const value = message.toString().toLowerCase();
            const liveview = (_c = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews) === null || _c === void 0 ? void 0 : _c.find(x => x.name.toLowerCase() === value);
            if (!liveview) {
                this.log.error("%s: Unable to locate a liveview named %s.", this.name(), message.toString());
                return;
            }
            (async () => {
                const newDevice = await this.setViewer(liveview.id);
                if (newDevice) {
                    this.accessory.context.device = newDevice;
                    this.log.info("%s: Liveview set via MQTT to %s.", this.name(), liveview.name);
                }
                else {
                    this.log.error("%s: Unable to set liveview via MQTT to %s.", this.name(), message.toString());
                }
            })();
        });
        // Trigger a motion event in MQTT, if requested to do so.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribeGet(this.accessory, this.name(), "liveview", "Liveview", () => {
            var _a, _b, _c, _d;
            const liveview = (_c = (_b = (_a = this.nvrApi) === null || _a === void 0 ? void 0 : _a.bootstrap) === null || _b === void 0 ? void 0 : _b.liveviews) === null || _c === void 0 ? void 0 : _c.find(x => x.id === this.accessory.context.device.liveview);
            return (_d = liveview === null || liveview === void 0 ? void 0 : liveview.name) !== null && _d !== void 0 ? _d : "None";
        });
        return true;
    }
}
exports.ProtectViewer = ProtectViewer;
//# sourceMappingURL=protect-viewer.js.map