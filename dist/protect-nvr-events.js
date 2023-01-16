"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectNvrEvents = void 0;
const unifi_protect_1 = require("unifi-protect");
const protect_camera_1 = require("./protect-camera");
const protect_accessory_1 = require("./protect-accessory");
class ProtectNvrEvents {
    constructor(nvr) {
        this.api = nvr.platform.api;
        this.debug = nvr.platform.debug.bind(nvr.platform);
        this.eventTimers = {};
        this.hap = nvr.platform.api.hap;
        this.lastMotion = {};
        this.lastRing = {};
        this.log = nvr.platform.log;
        this.name = () => {
            return nvr.nvrApi.getNvrName();
        };
        this.nvr = nvr;
        this.nvrApi = nvr.nvrApi;
        this.motionDuration = nvr.platform.config.motionDuration;
        this.platform = nvr.platform;
        this.ringDuration = nvr.platform.config.ringDuration;
        this.unsupportedDevices = {};
        this.updatesListener = null;
    }
    // Check for event updates.
    update() {
        // Configure the updates API listener, if needed. This needs to be called
        // regularly because the connection to the update events websocket can be shutdown and reopened.
        return this.configureUpdatesListener();
    }
    // Configure the realtime system event API listener to trigger events on accessories, like motion.
    // This is now deprecated in favor of the realtime updates event API, which provides for more event types
    // than the realtime system events API.
    configureSystemEventListener() {
        // Only configure the event listener if it exists and it's not already configured.
        if (!this.nvrApi.eventsWs || this.updatesListener) {
            return true;
        }
        // Listen for any messages coming in from our listener.
        this.nvrApi.eventsWs.on("message", this.updatesListener = (event) => {
            var _a, _b;
            let nvrEvent;
            try {
                nvrEvent = JSON.parse(event.toString());
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    this.log.error("%s: Unable to process message from the realtime system events API: \"%s\". Error: %s.", this.nvrApi.getNvrName(), event, error.message);
                }
                else {
                    this.log.error("%s: Unknown error has occurred: %s.", this.nvrApi.getNvrName(), error);
                }
                // Errors mean that we're done now.
                return;
            }
            // We're interested in device state change events.
            if ((nvrEvent === null || nvrEvent === void 0 ? void 0 : nvrEvent.type) !== "DEVICE_STATE_CHANGED") {
                return;
            }
            // We only want Protect controllers.
            const controller = (_b = (_a = nvrEvent.apps) === null || _a === void 0 ? void 0 : _a.controllers) === null || _b === void 0 ? void 0 : _b.find(x => x.name === "protect");
            if (!controller) {
                return;
            }
            // Find the device in our list of accessories so we can fire off the motion event.
            const foundDevice = Object.keys(this.nvr.configuredDevices).find(x => this.nvr.configuredDevices[x].accessory.context.device.host === controller.info.lastMotionCameraAddress);
            // Nothing here - we may have disabled this device or it's associated NVR.
            if (!foundDevice) {
                return;
            }
            // Now grab the accessory associated with the Protect device.
            const accessory = this.nvr.configuredDevices[foundDevice].accessory;
            // If we don't have an accessory, it's probably because we've chosen to hide it. In that case,
            // just ignore and move on. Alternatively, it could be a new device that we just don't know about yet,
            // In either case, we keep ignore it.
            if (!accessory) {
                return;
            }
            // The UniFi OS system events realtime API returns lastMotion in seconds rather than milliseconds.
            this.motionEventHandler(accessory, controller.info.lastMotion * 1000);
        });
        // Cleanup after ourselves.
        this.nvrApi.eventsWs.once("close", () => {
            var _a;
            if (this.updatesListener) {
                (_a = this.nvrApi.eventsWs) === null || _a === void 0 ? void 0 : _a.removeListener("message", this.updatesListener);
                this.updatesListener = null;
            }
        });
        return true;
    }
    // Configure the realtime update events API listener to trigger events on accessories, like motion.
    configureUpdatesListener() {
        // Only configure the event listener if it exists and it's not already configured.
        if (!this.nvrApi.eventsWs || this.updatesListener) {
            return true;
        }
        // Listen for any messages coming in from our listener.
        this.nvrApi.eventsWs.on("message", this.updatesListener = (event) => {
            var _a, _b, _c, _d;
            const updatePacket = unifi_protect_1.ProtectApiUpdates.decodeUpdatePacket(this.log, event);
            if (!updatePacket) {
                this.log.error("%s: Unable to process message from the realtime update events API.", this.nvrApi.getNvrName());
                return;
            }
            // The update actions that we care about (doorbell rings, motion detection) look like this:
            //
            // action: "update"
            // id: "someCameraId"
            // modelKey: "camera"
            // newUpdateId: "ignorethis"
            //
            // The payloads are what differentiate them - one updates lastMotion and the other lastRing.
            switch (updatePacket.action.modelKey) {
                case "camera": {
                    // We listen for the following camera update actions:
                    //   doorbell LCD updates
                    //   doorbell rings
                    //   motion detection
                    // We're only interested in update actions.
                    if (updatePacket.action.action !== "update") {
                        return;
                    }
                    // Grab the right payload type, camera update payloads.
                    const payload = updatePacket.payload;
                    // Now filter out payloads we aren't interested in. We only want motion detection and doorbell rings for now.
                    if (!payload.isMotionDetected && !payload.lastRing && !payload.lcdMessage &&
                        !payload.ledSettings && !payload.recordingSettings && !payload.state) {
                        return;
                    }
                    // Lookup the accessory associated with this device.
                    const accessory = this.nvr.accessoryLookup(updatePacket.action.id);
                    // We don't know about this device - we're done.
                    if (!accessory) {
                        return;
                    }
                    // Update the device JSON on the accessory.
                    accessory.context.device = Object.assign(accessory.context.device, payload);
                    // Grab the device context.
                    const device = accessory.context.device;
                    // Lookup the ProtectCamera instance associated with this accessory.
                    const protectCamera = this.nvr.configuredDevices[accessory.UUID];
                    if (!protectCamera) {
                        return;
                    }
                    // It's a motion event - process it accordingly.
                    if (payload.isMotionDetected) {
                        // We only want to process the motion event if we have the right payload, and either HKSV recording is enabled, or
                        // HKSV recording is disabled and we have smart motion events disabled since We handle those elsewhere.
                        if (payload.lastMotion &&
                            (((_a = protectCamera.stream.hksv) === null || _a === void 0 ? void 0 : _a.isRecording) || (!((_b = protectCamera.stream.hksv) === null || _b === void 0 ? void 0 : _b.isRecording) && !protectCamera.smartDetectTypes.length)) &&
                            this.nvr.optionEnabled(device, "Motion.NvrEvents", true)) {
                            this.motionEventHandler(accessory, payload.lastMotion);
                        }
                    }
                    // It's a ring event - process it accordingly.
                    if (payload.lastRing && this.nvr.optionEnabled(device, "Doorbell.NvrEvents", true)) {
                        this.doorbellEventHandler(accessory, payload.lastRing);
                    }
                    // It's a doorbell LCD message event - process it accordingly.
                    if (payload.lcdMessage) {
                        this.lcdMessageEventHandler(accessory, payload.lcdMessage);
                    }
                    // Process camera details updates:
                    //   - camera status light.
                    //   - camera recording settings.
                    if ((payload.ledSettings && ("isEnabled" in payload.ledSettings)) ||
                        (payload.recordingSettings && ("mode" in payload.recordingSettings)) || payload.recordingSettings) {
                        this.cameraDetailsHandler(accessory, protectCamera);
                    }
                    break;
                }
                case "event": {
                    // We listen for the following event actions:
                    //   smart motion detection
                    // We're only interested in add events.
                    if (updatePacket.action.action !== "add") {
                        return;
                    }
                    // Grab the right payload type, for event add payloads.
                    const payload = updatePacket.payload;
                    // We're only interested in smart motion detection events.
                    if (payload.type !== "smartDetectZone") {
                        return;
                    }
                    // Lookup the accessory associated with this camera.
                    const accessory = this.nvr.accessoryLookup(payload.camera);
                    // We don't know about this camera - we're done.
                    if (!accessory) {
                        return;
                    }
                    // Grab the device context.
                    const device = accessory.context.device;
                    // Lookup the ProtectCamera instance associated with this accessory.
                    const protectCamera = this.nvr.configuredDevices[accessory.UUID];
                    if (!protectCamera) {
                        return;
                    }
                    // Process the motion event.
                    if (this.nvr.optionEnabled(device, "Motion.SmartDetect.NvrEvents", true)) {
                        this.motionEventHandler(accessory, payload.start, payload.smartDetectTypes);
                    }
                    return;
                    break;
                }
                case "light": {
                    // We listen for the following light update actions:
                    //   light on / off
                    //   brightness adjustments
                    // We're only interested in update actions.
                    if (updatePacket.action.action !== "update") {
                        return;
                    }
                    // Grab the right payload type, camera update payloads.
                    const payload = updatePacket.payload;
                    // Now filter out payloads we aren't interested in. We only want light state, brightness, and motion detection.
                    if (!payload.isPirMotionDetected && !payload.isLightOn && !payload.lightDeviceSettings) {
                        return;
                    }
                    // Lookup the accessory associated with this device.
                    const accessory = this.nvr.accessoryLookup(updatePacket.action.id);
                    // We don't know about this device - we're done.
                    if (!accessory) {
                        return;
                    }
                    // Grab the device context.
                    const device = accessory.context.device;
                    // Lookup the ProtectCamera instance associated with this accessory.
                    const protectLight = this.nvr.configuredDevices[accessory.UUID];
                    if (!protectLight) {
                        return;
                    }
                    // It's a motion event - process it accordingly.
                    if (payload.isPirMotionDetected && payload.lastMotion && this.nvr.optionEnabled(device, "Motion.NvrEvents", true)) {
                        this.motionEventHandler(accessory, payload.lastMotion);
                    }
                    // It's a light power event - process it accordingly.
                    if (payload.isLightOn) {
                        this.lightPowerHandler(accessory, payload.isLightOn);
                    }
                    // It's light brightness event - process it accordingly.
                    if ((_c = payload.lightDeviceSettings) === null || _c === void 0 ? void 0 : _c.ledLevel) {
                        this.lightBrightnessHandler(accessory, payload.lightDeviceSettings.ledLevel);
                    }
                    break;
                }
                case "nvr": {
                    // We listen for the following sensor update actions:
                    //   motion events
                    //   sensor enablement / configuration changes
                    //   sensor updates (humidity, light, temperature)
                    // We're only interested in update actions.
                    if (updatePacket.action.action !== "update") {
                        return;
                    }
                    // Grab the right payload type.
                    const payload = updatePacket.payload;
                    // Now filter out payloads we aren't interested in. We only want NVR system information updates.
                    if (!("systemInfo" in payload)) {
                        return;
                    }
                    // Process it.
                    (_d = this.nvr.systemInfo) === null || _d === void 0 ? void 0 : _d.updateDevice(false, payload.systemInfo);
                    break;
                }
                case "sensor": {
                    // We listen for the following sensor update actions:
                    //   motion events
                    //   sensor enablement / configuration changes
                    //   sensor updates (humidity, light, temperature)
                    // We're only interested in update actions.
                    if (updatePacket.action.action !== "update") {
                        return;
                    }
                    // Grab the right payload type.
                    const payload = updatePacket.payload;
                    // Now filter out payloads we aren't interested in. We only want motion events, stats updates, and changes in sensor configuration.
                    if (!("isMotionDetected" in payload) && !("isOpened" in payload) && !("stats" in payload) &&
                        !("mountType" in payload) && !("alarmSettings" in payload) && !("humiditySettings" in payload) &&
                        !("lightSettings" in payload) && !("motionSettings" in payload) && !("temperatureSettings" in payload) &&
                        !("batteryStatus" in payload) && !("tamperingDetectedAt" in payload) && !("alarmTriggeredAt" in payload) &&
                        !("state" in payload)) {
                        return;
                    }
                    // Lookup the accessory associated with this device.
                    const accessory = this.nvr.accessoryLookup(updatePacket.action.id);
                    // We don't know about this device - we're done.
                    if (!accessory) {
                        return;
                    }
                    // Update the device JSON on the accessory.
                    accessory.context.device = Object.assign(accessory.context.device, payload);
                    // Grab the device context.
                    const device = accessory.context.device;
                    // Lookup the ProtectSensor instance associated with this accessory.
                    const protectSensor = this.nvr.configuredDevices[accessory.UUID];
                    if (!protectSensor) {
                        return;
                    }
                    // It's a motion event - process it accordingly.
                    if (payload.isMotionDetected && payload.motionDetectedAt && this.nvr.optionEnabled(device, "Motion.NvrEvents", true)) {
                        this.motionEventHandler(accessory, payload.motionDetectedAt);
                    }
                    // Process it.
                    this.sensorHandler(accessory, protectSensor);
                    break;
                }
                default:
                    // It's not a modelKey we're interested in. We're done.
                    return;
                    break;
            }
        });
        // Cleanup after ourselves.
        this.nvrApi.eventsWs.once("close", () => {
            var _a;
            if (this.updatesListener) {
                (_a = this.nvrApi.eventsWs) === null || _a === void 0 ? void 0 : _a.removeListener("message", this.updatesListener);
                this.updatesListener = null;
                this.log.error("%s: UniFi Protect realtime events API has been closed. This is usually due to a controller restart or disconnect.", this.name());
            }
        });
        return true;
    }
    // Camera details event processing from UniFi Protect for state-specific information.
    cameraDetailsHandler(accessory, protectCamera) {
        // Update the camera details in HomeKit.
        protectCamera.updateDevice();
    }
    // Motion event processing from UniFi Protect.
    motionEventHandler(accessory, lastMotion, detectedObjects = []) {
        const device = accessory.context.device;
        if (!device || !lastMotion) {
            return;
        }
        // Have we seen this event before? If so...move along.
        if (this.lastMotion[device.mac] >= lastMotion) {
            this.debug("%s: Skipping duplicate motion event.", this.nvrApi.getFullName(device));
            return;
        }
        // We only consider events that have happened within the last two refresh intervals. Otherwise, we assume
        // it's stale data and don't inform the user.
        if ((Date.now() - lastMotion) > (this.nvr.refreshInterval * 2 * 1000)) {
            this.debug("%s: Skipping motion event due to stale data.", this.nvrApi.getFullName(device));
            return;
        }
        // Remember this event.
        this.lastMotion[device.mac] = lastMotion;
        // If we already have a motion event inflight, allow it to complete so we don't spam users.
        if (this.eventTimers[device.mac]) {
            return;
        }
        // Only notify the user if we have a motion sensor and it's active.
        const motionService = accessory.getService(this.hap.Service.MotionSensor);
        if (motionService) {
            this.motionEventDelivery(accessory, motionService, detectedObjects);
        }
    }
    // Motion event delivery to HomeKit.
    motionEventDelivery(accessory, motionService, detectedObjects = []) {
        var _a, _b, _c, _d, _e;
        const device = accessory.context.device;
        // Lookup the ProtectCamera instance associated with this accessory.
        const protectCamera = this.nvr.configuredDevices[accessory.UUID];
        if (!protectCamera) {
            return;
        }
        // If we have disabled motion events, we're done here.
        if (("detectMotion" in accessory.context) && !accessory.context.detectMotion) {
            return;
        }
        // Trigger the motion event if:
        //  - It's not a smart motion event, or
        //  - It's an HKSV event, or
        //  - If HKSV is disabled and it's a smart motion event that we are interested in. Otherwise, we'll end up triggering multiple motion
        //    events with HKSV enabled and smart motion detection enabled.
        if (!detectedObjects.length || ((_a = protectCamera.stream.hksv) === null || _a === void 0 ? void 0 : _a.isRecording) ||
            (!((_b = protectCamera.stream.hksv) === null || _b === void 0 ? void 0 : _b.isRecording) && detectedObjects.length && detectedObjects.filter(x => protectCamera.smartDetectTypes.includes(x)).length)) {
            // Trigger the motion event in HomeKit.
            motionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, true);
            // Check to see if we have a motion trigger switch configured. If we do, update it.
            const triggerService = accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_TRIGGER);
            if (triggerService) {
                triggerService.updateCharacteristic(this.hap.Characteristic.On, true);
            }
            // Publish the motion event to MQTT, if the user has configured it.
            (_c = this.nvr.mqtt) === null || _c === void 0 ? void 0 : _c.publish(accessory, "motion", "true");
            // Log the event, if configured to do so.
            if (this.nvr.optionEnabled(device, "Log.Motion", false)) {
                this.log.info("%s: Motion detected%s.", this.nvrApi.getFullName(device), ((protectCamera instanceof protect_camera_1.ProtectCamera) && !((_d = protectCamera.stream.hksv) === null || _d === void 0 ? void 0 : _d.isRecording) && detectedObjects.length) ? ": " + detectedObjects.join(", ") : "");
            }
        }
        // Trigger smart motion contact sensors, if configured.
        for (const detectedObject of detectedObjects) {
            const contactService = accessory.getServiceById(this.hap.Service.ContactSensor, protect_accessory_1.ProtectReservedNames.CONTACT_MOTION_SMARTDETECT + "." + detectedObject);
            if (contactService) {
                contactService.updateCharacteristic(this.hap.Characteristic.ContactSensorState, true);
            }
            // Publish the smart motion event to MQTT, if the user has configured it.
            (_e = this.nvr.mqtt) === null || _e === void 0 ? void 0 : _e.publish(accessory, "motion/smart/" + detectedObject, "true");
        }
        // Reset our motion event after motionDuration if we don't already have a reset timer inflight.
        if (!this.eventTimers[device.mac]) {
            this.eventTimers[device.mac] = setTimeout(() => {
                var _a;
                const thisMotionService = accessory.getService(this.hap.Service.MotionSensor);
                if (thisMotionService) {
                    thisMotionService.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
                    // Check to see if we have a motion trigger switch configured. If we do, update it.
                    const thisTriggerService = accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_TRIGGER);
                    if (thisTriggerService) {
                        thisTriggerService.updateCharacteristic(this.hap.Characteristic.On, false);
                    }
                    this.debug("%s: Resetting motion event.", this.nvrApi.getFullName(device));
                }
                // Publish to MQTT, if the user has configured it.
                (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(accessory, "motion", "false");
                // Delete the timer from our motion event tracker.
                delete this.eventTimers[device.mac];
            }, this.motionDuration * 1000);
        }
        // Reset our smart motion contact sensors after motionDuration.
        if (!this.eventTimers[device.mac + ".Motion.SmartDetect.ObjectSensors"]) {
            this.eventTimers[device.mac + ".Motion.SmartDetect.ObjectSensors"] = setTimeout(() => {
                var _a;
                // Reset smart motion contact sensors, if configured.
                for (const detectedObject of detectedObjects) {
                    const contactService = accessory.getServiceById(this.hap.Service.ContactSensor, protect_accessory_1.ProtectReservedNames.CONTACT_MOTION_SMARTDETECT + "." + detectedObject);
                    if (contactService) {
                        contactService.updateCharacteristic(this.hap.Characteristic.ContactSensorState, false);
                    }
                    // Publish the smart motion event to MQTT, if the user has configured it.
                    (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(accessory, "motion/smart/" + detectedObject, "false");
                    this.debug("%s: Resetting smart object motion event.", this.nvrApi.getFullName(device));
                }
                // Delete the timer from our motion event tracker.
                delete this.eventTimers[device.mac + ".Motion.SmartDetect.ObjectSensors"];
            }, this.motionDuration * 1000);
        }
    }
    // Doorbell event processing from UniFi Protect and delivered to HomeKit.
    doorbellEventHandler(accessory, lastRing) {
        var _a;
        const device = accessory.context.device;
        if (!device || !lastRing) {
            return;
        }
        // Have we seen this event before? If so...move along. It's unlikely we hit this in a doorbell scenario, but just in case.
        if (this.lastRing[device.mac] >= lastRing) {
            this.debug("%s: Skipping duplicate doorbell ring.", this.nvrApi.getFullName(device));
            return;
        }
        // We only consider events that have happened within the last two refresh intervals. Otherwise, we assume it's stale
        // data and don't inform the user.
        if ((Date.now() - lastRing) > (this.nvr.refreshInterval * 2 * 1000)) {
            this.debug("%s: Skipping doorbell ring due to stale data.", this.nvrApi.getFullName(device));
            return;
        }
        // Remember this event.
        this.lastRing[device.mac] = lastRing;
        // Only notify the user if we have a doorbell.
        const doorbellService = accessory.getService(this.hap.Service.Doorbell);
        if (!doorbellService) {
            return;
        }
        // Trigger the doorbell. We delay this slightly to workaround what appears to be a race
        // condition bug in HomeKit. Inelegant, but effective.
        setTimeout(() => {
            var _a;
            (_a = doorbellService.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent)) === null || _a === void 0 ? void 0 : _a.sendEventNotification(this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
        }, 500);
        // Check to see if we have a doorbell trigger switch configured. If we do, update it.
        const triggerService = accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_DOORBELL_TRIGGER);
        if (triggerService) {
            // Kill any inflight trigger reset.
            if (this.eventTimers[device.mac + ".Doorbell.Ring.Trigger"]) {
                clearTimeout(this.eventTimers[device.mac + ".Doorbell.Ring.Trigger"]);
                delete this.eventTimers[device.mac + ".Doorbell.Ring.Trigger"];
            }
            const protectCamera = this.nvr.configuredDevices[accessory.UUID];
            // Flag that we're ringing.
            if (protectCamera) {
                protectCamera.isRinging = true;
            }
            // Update the trigger switch state.
            triggerService.updateCharacteristic(this.hap.Characteristic.On, true);
            // Reset our doorbell trigger after ringDuration.
            this.eventTimers[device.mac + ".Doorbell.Ring.Trigger"] = setTimeout(() => {
                if (protectCamera) {
                    protectCamera.isRinging = false;
                }
                triggerService.updateCharacteristic(this.hap.Characteristic.On, false);
                this.debug("%s: Resetting doorbell ring trigger.", this.nvrApi.getFullName(device));
                // Delete the timer from our motion event tracker.
                delete this.eventTimers[device.mac + ".Doorbell.Ring.Trigger"];
            }, this.ringDuration * 1000);
        }
        // Publish to MQTT, if the user has configured it.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(accessory, "doorbell", "true");
        if (this.nvr.optionEnabled(device, "Log.Doorbell", false)) {
            this.log.info("%s: Doorbell ring detected.", this.nvrApi.getFullName(device));
        }
        // Kill any inflight ring reset.
        if (this.eventTimers[device.mac + ".Doorbell.Ring"]) {
            clearTimeout(this.eventTimers[device.mac + ".Doorbell.Ring"]);
            delete this.eventTimers[device.mac + ".Doorbell.Ring"];
        }
        // Fire off our MQTT doorbell ring event after ringDuration.
        this.eventTimers[device.mac + ".Doorbell.Ring"] = setTimeout(() => {
            var _a;
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(accessory, "doorbell", "false");
            // Delete the timer from our event tracker.
            delete this.eventTimers[device.mac + ".Doorbell.Ring"];
        }, this.ringDuration * 1000);
    }
    // LCD message event processing from UniFi Protect and delivered to HomeKit.
    lcdMessageEventHandler(accessory, lcdMessage) {
        var _a;
        const device = accessory.context.device;
        if (!device) {
            return;
        }
        (_a = this.nvr.configuredDevices[accessory.UUID]) === null || _a === void 0 ? void 0 : _a.updateLcdSwitch(lcdMessage);
    }
    // Light power state event processing from UniFi Protect.
    lightPowerHandler(accessory, lightState) {
        const device = accessory.context.device;
        if (!device) {
            return;
        }
        // Update the power state on the accessory.
        const lightService = accessory.getService(this.hap.Service.Lightbulb);
        lightService === null || lightService === void 0 ? void 0 : lightService.updateCharacteristic(this.hap.Characteristic.On, lightState);
    }
    // Light power state event processing from UniFi Protect.
    lightBrightnessHandler(accessory, brightness) {
        const device = accessory.context.device;
        if (!device || (brightness < 1)) {
            return;
        }
        // Update the power state on the accessory.
        const lightService = accessory.getService(this.hap.Service.Lightbulb);
        lightService === null || lightService === void 0 ? void 0 : lightService.updateCharacteristic(this.hap.Characteristic.Brightness, (brightness - 1) * 20);
    }
    // Sensor state event processing from UniFi Protect.
    sensorHandler(accessory, protectSensor) {
        // Update the sensor state in HomeKit.
        protectSensor.updateDevice();
    }
}
exports.ProtectNvrEvents = ProtectNvrEvents;
//# sourceMappingURL=protect-nvr-events.js.map