"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectDoorbell = void 0;
const protect_camera_1 = require("./protect-camera");
class ProtectDoorbell extends protect_camera_1.ProtectCamera {
    // Configure the doorbell for HomeKit.
    async configureDevice() {
        var _a, _b, _c, _d, _e, _f;
        this.defaultDuration = ((_e = (_d = (_c = (_b = (_a = this.nvr) === null || _a === void 0 ? void 0 : _a.nvrApi) === null || _b === void 0 ? void 0 : _b.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr) === null || _d === void 0 ? void 0 : _d.doorbellSettings) === null || _e === void 0 ? void 0 : _e.defaultMessageResetTimeoutMs) === undefined ? 60000 :
            this.nvr.nvrApi.bootstrap.nvr.doorbellSettings.defaultMessageResetTimeoutMs;
        this.isMessagesEnabled = true;
        this.isMessagesFromControllerEnabled = true;
        this.messageSwitches = [];
        // We only want to deal with cameras with chimes.
        if (!((_f = this.accessory.context.device) === null || _f === void 0 ? void 0 : _f.featureFlags.hasChime)) {
            return false;
        }
        // The user has disabled the doorbell message functionality.
        if (!this.nvr.optionEnabled(this.accessory.context.device, "Doorbell.Messages")) {
            this.isMessagesEnabled = false;
        }
        // The user has disabled the doorbell message functionality.
        if (!this.nvr.optionEnabled(this.accessory.context.device, "Doorbell.Messages.FromDoorbell")) {
            this.isMessagesFromControllerEnabled = false;
        }
        // Call our parent to setup the camera portion of the doorbell.
        await super.configureDevice();
        // Let's setup the doorbell-specific attributes.
        this.configureVideoDoorbell();
        this.nvr.doorbellCount++;
        // Now, make the doorbell LCD message functionality available.
        return this.configureDoorbellLcdSwitch();
    }
    // Configure our access to the Doorbell LCD screen.
    configureDoorbellLcdSwitch() {
        var _a, _b, _c;
        const camera = (_a = this.accessory) === null || _a === void 0 ? void 0 : _a.context.device;
        // Make sure we're configuring a camera device with an LCD screen (aka a doorbell).
        if (((camera === null || camera === void 0 ? void 0 : camera.modelKey) !== "camera") || !(camera === null || camera === void 0 ? void 0 : camera.featureFlags.hasLcdScreen)) {
            return false;
        }
        // Grab the consolidated list of messages from the doorbell and our configuration.
        const doorbellMessages = this.getMessages();
        // Look through the combined messages from the doorbell and what the user has configured and tell HomeKit about it.
        for (const entry of doorbellMessages) {
            // Truncate anything longer than the character limit that the doorbell will accept.
            if (entry.text.length > 30) {
                entry.text = entry.text.slice(0, 30);
            }
            // In the unlikely event someone tries to use words we have reserved for our own use.
            if (this.isReservedName(entry.text)) {
                continue;
            }
            // Check to see if we already have this message switch configured.
            if ((_b = this.messageSwitches) === null || _b === void 0 ? void 0 : _b.some(x => (x.type === entry.type) && (x.text === entry.text))) {
                continue;
            }
            this.log.info("%s: Discovered doorbell message switch%s: %s.", this.name(), entry.duration ? " (" + (entry.duration / 1000).toString() + " seconds)" : "", entry.text);
            // Use the message switch, if it already exists.
            let switchService = this.accessory.getServiceById(this.hap.Service.Switch, entry.type + "." + entry.text);
            // It's a new message, let's create the service for it. Each message cannot exceed 30 characters, but
            // given that HomeKit allows for strings to be up to 64 characters long, this should be fine.
            if (!switchService) {
                switchService = new this.hap.Service.Switch(entry.text, entry.type + "." + entry.text);
                if (!switchService) {
                    this.log.error("%s: Unable to add doorbell message switch: %s.", this.name(), entry.text);
                    continue;
                }
                this.accessory.addService(switchService);
            }
            const duration = "duration" in entry ? entry.duration : this.defaultDuration;
            // Save the message switch in the list we maintain.
            this.messageSwitches.push({ duration: duration, service: switchService, state: false, text: entry.text, type: entry.type }) - 1;
            // Configure the message switch.
            (_c = switchService
                .getCharacteristic(this.hap.Characteristic.On)) === null || _c === void 0 ? void 0 : _c.onGet(this.getSwitchState.bind(this, this.messageSwitches[this.messageSwitches.length - 1])).onSet(this.setSwitchState.bind(this, this.messageSwitches[this.messageSwitches.length - 1]));
        }
        // Update the message switch state in HomeKit.
        this.updateLcdSwitch(camera.lcdMessage);
        // Check to see if any of our existing doorbell messages have disappeared.
        this.validateMessageSwitches(doorbellMessages);
        return true;
    }
    // Configure MQTT capabilities for the doorbell.
    configureMqtt() {
        var _a, _b;
        // Call our parent to setup the general camera MQTT capabilities.
        super.configureMqtt();
        // Get the current message on the doorbell.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "message/get", (message) => {
            var _a, _b, _c;
            const value = message.toString();
            // When we get the right message, we return the current message set on the doorbell.
            if ((value === null || value === void 0 ? void 0 : value.toLowerCase()) !== "true") {
                return;
            }
            const device = this.accessory.context.device;
            const doorbellMessage = (_b = (_a = device.lcdMessage) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : "";
            const doorbellDuration = (("resetAt" in device.lcdMessage) && device.lcdMessage.resetAt !== null) ?
                Math.round((device.lcdMessage.resetAt - Date.now()) / 1000) : 0;
            // Publish the current message.
            (_c = this.nvr.mqtt) === null || _c === void 0 ? void 0 : _c.publish(this.accessory, "message", JSON.stringify({ duration: doorbellDuration, message: doorbellMessage }));
            this.log.info("%s: Doorbell message information published via MQTT.", this.name());
        });
        // We support the ability to set the doorbell message like so:
        //
        //   { "message": "some message", "duration": 30 }
        //
        // If duration is omitted, we assume the default duration.
        // If duration is 0, we assume it's not expiring.
        // If the message is blank, we assume we're resetting the doorbell message.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribe(this.accessory, "message/set", (message) => {
            let incomingPayload;
            let outboundPayload;
            // Catch any errors in parsing what we get over MQTT.
            try {
                incomingPayload = JSON.parse(message.toString());
                // Sanity check what comes in from MQTT to make sure it's what we want.
                if (!(incomingPayload instanceof Object)) {
                    throw new Error("The JSON object is not in the expected format");
                }
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    this.log.error("%s: Unable to process MQTT message: \"%s\". Error: %s.", this.name(), message.toString(), error.message);
                }
                else {
                    this.log.error("%s: Unknown error has occurred: %s.", this.name(), error);
                }
                // Errors mean that we're done now.
                return;
            }
            // At a minimum, make sure a message was specified. If we have specified duration, make sure it's a number.
            // Our NaN test may seem strange - that's because NaN is the only JavaScript value that is treated as unequal
            // to itself. Meaning, you can always test if a value is NaN by checking it for equality to itself. Weird huh?
            if (!("message" in incomingPayload) || (("duration" in incomingPayload) && (incomingPayload.duration !== incomingPayload.duration))) {
                this.log.error("%s: Unable to process MQTT message: \"%s\".", this.name(), incomingPayload);
                return;
            }
            // If no duration specified, or a negative duration, we assume the default duration.
            if (!("duration" in incomingPayload) || (("duration" in incomingPayload) && (incomingPayload.duration < 0))) {
                incomingPayload.duration = this.defaultDuration;
            }
            else {
                incomingPayload.duration = incomingPayload.duration * 1000;
            }
            // No message defined...we assume we're resetting the message.
            if (!incomingPayload.message.length) {
                outboundPayload = { resetAt: 0 };
                this.log.info("%s: Received MQTT doorbell message reset.", this.name());
            }
            else {
                outboundPayload = { duration: incomingPayload.duration, text: incomingPayload.message, type: "CUSTOM_MESSAGE" };
                this.log.info("%s: Received MQTT doorbell message%s: %s.", this.name(), outboundPayload.duration ? " (" + (outboundPayload.duration / 1000).toString() + " seconds)" : "", outboundPayload.text);
            }
            // Send it to the doorbell and we're done.
            void this.setMessage(outboundPayload);
        });
        return true;
    }
    // Get the list of messages from the doorbell and the user configuration.
    getMessages() {
        var _a, _b, _c, _d;
        // First, we get our builtin and configured messages from the controller.
        const doorbellSettings = (_d = (_c = (_b = (_a = this.nvr) === null || _a === void 0 ? void 0 : _a.nvrApi) === null || _b === void 0 ? void 0 : _b.bootstrap) === null || _c === void 0 ? void 0 : _c.nvr) === null || _d === void 0 ? void 0 : _d.doorbellSettings;
        // Something's not right with the configuration...we're done.
        if (!doorbellSettings || !this.isMessagesEnabled) {
            return [];
        }
        let doorbellMessages = [];
        // Grab any messages that the user has configured.
        if (this.nvr.config.doorbellMessages) {
            for (const configEntry of this.nvr.config.doorbellMessages) {
                let duration = this.defaultDuration;
                // If we've set a duration, let's honor it. If it's less than zero, use the default duration.
                if (("duration" in configEntry) && !isNaN(configEntry.duration) && (configEntry.duration >= 0)) {
                    duration = configEntry.duration * 1000;
                }
                // Add it to our list.
                doorbellMessages.push({ duration: duration, text: configEntry.message, type: "CUSTOM_MESSAGE" });
            }
        }
        // If we've got messages on the controller, let's configure those, unless the user has disabled that feature.
        if (this.isMessagesFromControllerEnabled && doorbellSettings.allMessages.length) {
            doorbellMessages = doorbellSettings.allMessages.concat(doorbellMessages);
        }
        // Return the list of doorbell messages.
        return doorbellMessages;
    }
    // Validate our existing HomeKit message switch list.
    validateMessageSwitches(messageList) {
        var _a, _b;
        // Figure out if there's anything that's disappeared in the canonical list from the doorbell.
        for (const entry of this.messageSwitches) {
            // This exists on the doorbell...move along.
            if (messageList === null || messageList === void 0 ? void 0 : messageList.some(x => (x.type === entry.type) && (x.text === entry.text))) {
                continue;
            }
            this.log.info("%s: Removing saved doorbell message: %s.", this.name(), entry.text);
            // The message has been deleted on the doorbell, remove it in HomeKit.
            this.accessory.removeService(entry.service);
            this.messageSwitches.splice(this.messageSwitches.indexOf(entry), 1);
        }
        // Loop through the list of services on our doorbell accessory and sync the message switches.
        // We do this to catch the scenario where Homebridge was shutdown, and the list of saved messages
        // on the controller changes.
        for (const switchService of this.accessory.services) {
            // We only want to look at switches.
            if (switchService.UUID !== this.hap.Service.Switch.UUID) {
                continue;
            }
            // We don't want to touch any reserved switch types here. If it's a non-reserved type, it's fair game.
            if (this.isReservedName(switchService.subtype)) {
                continue;
            }
            // The message exists on the doorbell.
            if ((_a = this.messageSwitches) === null || _a === void 0 ? void 0 : _a.some(x => (x.type + "." + x.text) === switchService.subtype)) {
                continue;
            }
            // The message has been deleted on the doorbell - remove it from HomeKit and inform the user about it.
            this.log.info("%s: Removing saved doorbell message: %s.", this.name(), (_b = switchService.subtype) === null || _b === void 0 ? void 0 : _b.slice(switchService.subtype.indexOf(".") + 1));
            this.accessory.removeService(switchService);
        }
    }
    // Update the message switch state in HomeKit.
    updateLcdSwitch(lcdMessage) {
        var _a, _b;
        // The message has been cleared on the doorbell, turn off all message switches in HomeKit.
        if (!Object.keys(lcdMessage).length) {
            for (const lcdEntry of this.messageSwitches) {
                lcdEntry.state = false;
                lcdEntry.service.updateCharacteristic(this.hap.Characteristic.On, false);
            }
            return;
        }
        // Sanity check.
        if (!("type" in lcdMessage) || !("text" in lcdMessage)) {
            return;
        }
        // The message has been set on the doorbell. Update HomeKit accordingly.
        for (const lcdEntry of this.messageSwitches) {
            // If it's not the message we're interested in, make sure it's off and keep going.
            if (lcdEntry.service.subtype !== (lcdMessage.type + "." + lcdMessage.text)) {
                lcdEntry.state = false;
                lcdEntry.service.updateCharacteristic(this.hap.Characteristic.On, false);
                continue;
            }
            // If the message switch is already on, we're done.
            if (lcdEntry.state) {
                continue;
            }
            // Set the message state and update HomeKit.
            lcdEntry.state = true;
            lcdEntry.service.updateCharacteristic(this.hap.Characteristic.On, true);
            this.log.info("%s: Doorbell message set%s: %s.", this.name(), lcdMessage.resetAt !== null ? " (" + Math.round((((_a = lcdMessage.resetAt) !== null && _a !== void 0 ? _a : 0) - Date.now()) / 1000).toString() + " seconds)" : "", lcdMessage.text);
            // Publish to MQTT, if the user has configured it.
            (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.publish(this.accessory, "message", JSON.stringify({ duration: lcdEntry.duration / 1000, message: lcdEntry.text }));
        }
    }
    // Get the current state of this message switch.
    getSwitchState(messageSwitch) {
        return messageSwitch.state;
    }
    // Toggle the message on the doorbell.
    async setSwitchState(messageSwitch, value) {
        // Tell the doorbell to display our message.
        if (messageSwitch.state !== value) {
            const payload = (value === true) ?
                { duration: messageSwitch.duration, text: messageSwitch.text, type: messageSwitch.type } :
                { resetAt: 0 };
            // Set the message and sync our states.
            await this.setMessage(payload);
        }
    }
    // Set the message on the doorbell.
    async setMessage(payload = { resetAt: 0 }) {
        // We take the duration and save it for MQTT and then translate the payload into what Protect is expecting from us.
        if ("duration" in payload) {
            payload.resetAt = payload.duration ? Date.now() + payload.duration : null;
            delete payload.duration;
        }
        // An empty payload means we're resetting. Set the reset timer to 0 and we're done.
        if (!Object.keys(payload).length) {
            payload.resetAt = 0;
        }
        // Push the update to the doorbell.
        const newDevice = await this.nvr.nvrApi.updateCamera(this.accessory.context.device, { lcdMessage: payload });
        if (!newDevice) {
            this.log.error("%s: Unable to set doorbell message. Please ensure this username has the Administrator role in UniFi Protect.", this.name());
            return false;
        }
        // Set the context to our updated device configuration.
        this.accessory.context.device = newDevice;
        return true;
    }
}
exports.ProtectDoorbell = ProtectDoorbell;
//# sourceMappingURL=protect-doorbell.js.map