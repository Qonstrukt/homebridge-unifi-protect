"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectCamera = void 0;
/* Copyright(C) 2019-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-camera.ts: Camera device class for UniFi Protect.
 */
const protect_accessory_1 = require("./protect-accessory");
const settings_1 = require("./settings");
const protect_stream_1 = require("./protect-stream");
class ProtectCamera extends protect_accessory_1.ProtectAccessory {
    // Configure a camera accessory for HomeKit.
    async configureDevice() {
        var _a, _b, _c;
        this.isDoorbellConfigured = false;
        this.isHksv = false;
        this.isRinging = false;
        this.isVideoConfigured = false;
        this.rtspQuality = {};
        this.smartDetectTypes = [];
        // Save the device object before we wipeout the context.
        const device = this.accessory.context.device;
        // Default to enabling camera motion detection.
        let detectMotion = true;
        // Save the motion sensor switch state before we wipeout the context.
        if (this.accessory.context.detectMotion !== undefined) {
            detectMotion = this.accessory.context.detectMotion;
        }
        // Default to disabling the dynamic bitrate setting.
        let dynamicBitrate = false;
        // Save the dynamic bitrate switch state before we wipeout the context.
        if (this.accessory.context.dynamicBitrate !== undefined) {
            dynamicBitrate = this.accessory.context.dynamicBitrate;
        }
        // Default to enabling HKSV recording.
        let hksvRecording = true;
        // Save the HKSV recording switch state before we wipeout the context.
        if (this.accessory.context.hksvRecording !== undefined) {
            hksvRecording = this.accessory.context.hksvRecording;
        }
        // Clean out the context object in case it's been polluted somehow.
        this.accessory.context = {};
        this.accessory.context.device = device;
        this.accessory.context.nvr = (_a = this.nvr.nvrApi.bootstrap) === null || _a === void 0 ? void 0 : _a.nvr.mac;
        this.accessory.context.detectMotion = detectMotion;
        this.accessory.context.dynamicBitrate = dynamicBitrate;
        this.accessory.context.hksvRecording = hksvRecording;
        // Inform the user if we have enabled the dynamic bitrate setting.
        if ((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Video.DynamicBitrate", false)) {
            this.log.info("%s: Dynamic streaming bitrate adjustment on the UniFi Protect controller enabled.", this.name());
        }
        // If the camera supports it, check to see if we have smart motion events enabled.
        if (device.featureFlags.hasSmartDetect && ((_c = this.nvr) === null || _c === void 0 ? void 0 : _c.optionEnabled(device, "Motion.SmartDetect", false))) {
            // We deal with smart motion detection options here and save them on the ProtectCamera instance because
            // we're trying to optimize and reduce the number of feature option lookups we do in realtime, when possible.
            // Reading a stream of constant events and having to perform a string comparison through a list of options multiple
            // times a second isn't an ideal use of CPU cycles, even if you have plenty of them to spare. Instead, we perform
            // that lookup once, here, and set the appropriate option booleans for faster lookup and use later in event
            // detection.
            // Check for the smart motion detection object types that UniFi Protect supports.
            this.smartDetectTypes = device.featureFlags.smartDetectTypes.filter(x => { var _a; return (_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(device, "Motion.SmartDetect." + x); });
            // Inform the user of what smart detection object types we're configured for.
            this.log.info("%s: Smart motion detection enabled%s.", this.name(), this.smartDetectTypes.length ? ": " + this.smartDetectTypes.join(", ") : "");
        }
        // Configure accessory information.
        this.configureInfo();
        // Configure MQTT services.
        this.configureMqtt();
        // Configure the motion sensor.
        this.configureMotionSensor();
        this.configureMotionSwitch();
        this.configureMotionTrigger();
        // Configure smart motion contact sensors.
        this.configureMotionSmartSensor();
        // Configure two-way audio support.
        this.configureTwoWayAudio();
        // Configure HomeKit Secure Video suport.
        this.configureHksv();
        this.configureHksvRecordingSwitch();
        // Configure our video stream.
        await this.configureVideoStream();
        // Configure our camera details.
        this.configureCameraDetails();
        // Configure our bitrate switch.
        this.configureDynamicBitrateSwitch();
        // Configure our NVR recording switches.
        this.configureNvrRecordingSwitch();
        // Configure the doorbell trigger.
        this.configureDoorbellTrigger();
        return true;
    }
    // Configure discrete smart motion contact sensors for HomeKit.
    configureMotionSmartSensor() {
        var _a, _b, _c, _d, _e, _f;
        const device = this.accessory.context.device;
        // Check for object-centric contact sensors that are no longer enabled and remove them.
        for (const objectService of this.accessory.services.filter(x => { var _a; return (_a = x.subtype) === null || _a === void 0 ? void 0 : _a.startsWith(protect_accessory_1.ProtectReservedNames.CONTACT_MOTION_SMARTDETECT + "."); })) {
            // If we have motion sensors as well as object contact sensors enabled, and we have this object type enabled on this camera, we're good here.
            if (((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(device, "Motion.Sensor")) &&
                ((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(device, "Motion.SmartDetect.ObjectSensors", false))) {
                continue;
            }
            // We don't have this contact sensor enabled, remove it.
            this.accessory.removeService(objectService);
            this.log.info("%s: Disabling smart motion contact sensor: %s.", this.name(), (_c = objectService.subtype) === null || _c === void 0 ? void 0 : _c.slice(((_d = objectService.subtype) === null || _d === void 0 ? void 0 : _d.indexOf(".")) + 1));
        }
        // Have we disabled motion sensors? If so, we're done.
        if (!((_e = this.nvr) === null || _e === void 0 ? void 0 : _e.optionEnabled(device, "Motion.Sensor"))) {
            return false;
        }
        // Have we enabled discrete contact sensors for specific object types? If not, we're done here.
        if (!((_f = this.nvr) === null || _f === void 0 ? void 0 : _f.optionEnabled(device, "Motion.SmartDetect.ObjectSensors", false))) {
            return false;
        }
        // Add individual contact sensors for each object detection type, if needed.
        for (const smartDetectType of device.featureFlags.smartDetectTypes) {
            // See if we already have this contact sensor configured.
            let contactService = this.accessory.getServiceById(this.hap.Service.ContactSensor, protect_accessory_1.ProtectReservedNames.CONTACT_MOTION_SMARTDETECT + "." + smartDetectType);
            // If not, let's add it.
            if (!contactService) {
                contactService = new this.hap.Service.ContactSensor(this.accessory.displayName + " " + smartDetectType.charAt(0).toUpperCase() + smartDetectType.slice(1), protect_accessory_1.ProtectReservedNames.CONTACT_MOTION_SMARTDETECT + "." + smartDetectType);
                // Something went wrong, we're done here.
                if (!contactService) {
                    this.log.error("%s: Unable to add smart motion contact sensor for %s detection.", this.name(), smartDetectType);
                    return false;
                }
                // Finally, add it to the camera.
                this.accessory.addService(contactService);
            }
            // Initialize the sensor.
            contactService.updateCharacteristic(this.hap.Characteristic.ContactSensorState, false);
        }
        this.log.info("%s: Smart motion contact sensor%s enabled: %s.", this.name(), device.featureFlags.smartDetectTypes.length > 1 ? "s" : "", device.featureFlags.smartDetectTypes.join(", "));
        return true;
    }
    // Configure a switch to manually trigger a motion sensor event for HomeKit.
    configureMotionTrigger() {
        var _a, _b, _c;
        // Find the switch service, if it exists.
        let triggerService = this.accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_TRIGGER);
        // Motion triggers are disabled by default and primarily exist for automation purposes.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Motion.Sensor")) ||
            !((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Motion.Trigger", false))) {
            if (triggerService) {
                this.accessory.removeService(triggerService);
            }
            return false;
        }
        // Add the switch to the camera, if needed.
        if (!triggerService) {
            triggerService = new this.hap.Service.Switch(this.accessory.displayName + " Motion Trigger", protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_TRIGGER);
            if (!triggerService) {
                this.log.error("%s: Unable to add motion sensor trigger.", this.name());
                return false;
            }
            this.accessory.addService(triggerService);
        }
        const motionService = this.accessory.getService(this.hap.Service.MotionSensor);
        const switchService = this.accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_MOTION_SENSOR);
        // Activate or deactivate motion detection.
        (_c = triggerService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _c === void 0 ? void 0 : _c.onGet(() => {
            return (motionService === null || motionService === void 0 ? void 0 : motionService.getCharacteristic(this.hap.Characteristic.MotionDetected).value) === true;
        }).onSet((value) => {
            if (value) {
                // Check to see if motion events are disabled.
                if (switchService && !switchService.getCharacteristic(this.hap.Characteristic.On).value) {
                    setTimeout(() => {
                        triggerService === null || triggerService === void 0 ? void 0 : triggerService.updateCharacteristic(this.hap.Characteristic.On, false);
                    }, 50);
                }
                else {
                    // Trigger the motion event.
                    this.nvr.events.motionEventHandler(this.accessory, Date.now());
                    this.log.info("%s: Motion event triggered.", this.name());
                }
            }
            else {
                // If the motion sensor is still on, we should be as well.
                if (motionService === null || motionService === void 0 ? void 0 : motionService.getCharacteristic(this.hap.Characteristic.MotionDetected).value) {
                    setTimeout(() => {
                        triggerService === null || triggerService === void 0 ? void 0 : triggerService.updateCharacteristic(this.hap.Characteristic.On, true);
                    }, 50);
                }
            }
        });
        // Initialize the switch.
        triggerService.updateCharacteristic(this.hap.Characteristic.On, false);
        this.log.info("%s: Enabling motion sensor automation trigger.", this.name());
        return true;
    }
    // Configure a switch to manually trigger a doorbell ring event for HomeKit.
    configureDoorbellTrigger() {
        var _a, _b;
        const camera = this.accessory.context.device;
        // Find the switch service, if it exists.
        let triggerService = this.accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_DOORBELL_TRIGGER);
        // See if we have a doorbell service configured.
        let doorbellService = this.accessory.getService(this.hap.Service.Doorbell);
        // Doorbell switches are disabled by default and primarily exist for automation purposes.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Doorbell.Trigger", false))) {
            if (triggerService) {
                this.accessory.removeService(triggerService);
            }
            // Since we aren't enabling the doorbell trigger on this camera, remove the doorbell service if the camera
            // isn't actually doorbell-capable hardware.
            if (!camera.featureFlags.hasChime && doorbellService) {
                this.accessory.removeService(doorbellService);
            }
            return false;
        }
        // We don't have a doorbell service configured, but since we've enabled a doorbell switch, we create the doorbell for
        // automation purposes.
        if (!doorbellService) {
            // Configure the doorbell service.
            if (!this.configureVideoDoorbell()) {
                return false;
            }
            // Now find the doorbell service.
            if (!(doorbellService = this.accessory.getService(this.hap.Service.Doorbell))) {
                this.log.error("%s: Unable to find the doorbell service.", this.name());
                return false;
            }
        }
        // Add the switch to the camera, if needed.
        if (!triggerService) {
            triggerService = new this.hap.Service.Switch(this.accessory.displayName + " Doorbell Trigger", protect_accessory_1.ProtectReservedNames.SWITCH_DOORBELL_TRIGGER);
            if (!triggerService) {
                this.log.error("%s: Unable to add the doorbell trigger.", this.name());
                return false;
            }
            this.accessory.addService(triggerService);
        }
        // Trigger the doorbell.
        (_b = triggerService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            return this.isRinging;
        }).onSet((value) => {
            if (value) {
                // Trigger the motion event.
                this.nvr.events.doorbellEventHandler(this.accessory, Date.now());
                this.log.info("%s: Doorbell ring event triggered.", this.name());
            }
            else {
                // If the doorbell ring event is still going, we should be as well.
                if (this.isRinging) {
                    setTimeout(() => {
                        triggerService === null || triggerService === void 0 ? void 0 : triggerService.updateCharacteristic(this.hap.Characteristic.On, true);
                    }, 50);
                }
            }
        });
        // Initialize the switch.
        triggerService.updateCharacteristic(this.hap.Characteristic.On, false);
        this.log.info("%s: Enabling doorbell automation trigger.", this.name());
        return true;
    }
    // Configure the doorbell service for HomeKit.
    configureVideoDoorbell() {
        // Only configure the doorbell service if we haven't configured it before.
        if (this.isDoorbellConfigured) {
            return true;
        }
        // Find the doorbell service, if it exists.
        let doorbellService = this.accessory.getService(this.hap.Service.Doorbell);
        // Add the doorbell service to this Protect doorbell. HomeKit requires the doorbell service to be
        // marked as the primary service on the accessory.
        if (!doorbellService) {
            doorbellService = new this.hap.Service.Doorbell(this.accessory.displayName);
            if (!doorbellService) {
                this.log.error("%s: Unable to add doorbell.", this.name());
                return false;
            }
            this.accessory.addService(doorbellService);
        }
        doorbellService.setPrimaryService(true);
        this.isDoorbellConfigured = true;
        return true;
    }
    // Configure two-way audio support for HomeKit.
    configureTwoWayAudio() {
        var _a, _b;
        // Identify twoway-capable devices.
        if (!this.accessory.context.device.hasSpeaker) {
            return this.twoWayAudio = false;
        }
        // Enabled by default unless disabled by the user.
        return this.twoWayAudio = ((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Audio")) &&
            ((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Audio.TwoWay"));
    }
    // Configure additional camera-specific characteristics for HomeKit.
    configureCameraDetails() {
        var _a;
        // Find the service, if it exists.
        const service = this.accessory.getService(this.hap.Service.CameraOperatingMode);
        // Grab our device context.
        const device = this.accessory.context.device;
        // Turn the status light on or off.
        if (device.featureFlags.hasLedStatus) {
            (_a = service === null || service === void 0 ? void 0 : service.getCharacteristic(this.hap.Characteristic.CameraOperatingModeIndicator)) === null || _a === void 0 ? void 0 : _a.onGet(() => {
                var _a;
                return ((_a = this.accessory.context.device.ledSettings) === null || _a === void 0 ? void 0 : _a.isEnabled) === true;
            }).onSet(async (value) => {
                const ledState = value === true;
                // Update the status light in Protect.
                const newDevice = await this.nvr.nvrApi.updateCamera(this.accessory.context.device, { ledSettings: { isEnabled: ledState } });
                if (!newDevice) {
                    this.log.error("%s: Unable to turn the status light %s. Please ensure this username has the Administrator role in UniFi Protect.", this.name(), ledState ? "on" : "off");
                    return;
                }
                // Set the context to our updated device configuration.
                this.accessory.context.device = newDevice;
            });
            // Initialize the status light state.
            service === null || service === void 0 ? void 0 : service.updateCharacteristic(this.hap.Characteristic.CameraOperatingModeIndicator, device.ledSettings.isEnabled === true);
        }
        return true;
    }
    // Configure a camera accessory for HomeKit.
    async configureVideoStream() {
        var _a, _b;
        const bootstrap = this.nvr.nvrApi.bootstrap;
        let device = this.accessory.context.device;
        const nvr = this.nvr;
        const nvrApi = this.nvr.nvrApi;
        const rtspEntries = [];
        // No channels exist on this camera or we don't have access to the bootstrap configuration.
        if (!(device === null || device === void 0 ? void 0 : device.channels) || !bootstrap) {
            return false;
        }
        // Enable RTSP on the camera if needed and get the list of RTSP streams we have ultimately configured.
        device = (_a = await nvrApi.enableRtsp(device)) !== null && _a !== void 0 ? _a : device;
        // Figure out which camera channels are RTSP-enabled, and user-enabled.
        const cameraChannels = device.channels.filter(x => x.isRtspEnabled && nvr.optionEnabled(device, "Video.Stream." + x.name));
        // Make sure we've got a HomeKit compatible IDR frame interval. If not, let's take care of that.
        let idrChannels = cameraChannels.filter(x => x.idrInterval !== settings_1.PROTECT_HOMEKIT_IDR_INTERVAL);
        if (idrChannels.length) {
            // Edit the channel map.
            idrChannels = idrChannels.map(x => {
                x.idrInterval = settings_1.PROTECT_HOMEKIT_IDR_INTERVAL;
                return x;
            });
            device = (_b = await nvrApi.updateCamera(device, { channels: idrChannels })) !== null && _b !== void 0 ? _b : device;
            this.accessory.context.device = device;
        }
        // Set the camera and shapshot URLs.
        const cameraUrl = "rtsps://" + nvr.nvrAddress + ":" + bootstrap.nvr.ports.rtsps.toString() + "/";
        this.snapshotUrl = nvrApi.camerasUrl() + "/" + device.id + "/snapshot";
        // No RTSP streams are available that meet our criteria - we're done.
        if (!cameraChannels.length) {
            this.log.info("%s: No RTSP stream profiles have been configured for this camera. %s", this.name(), "Enable at least one RTSP stream profile in the UniFi Protect webUI to resolve this issue or " +
                "assign the Administrator role to the user configured for this plugin to allow it to automatically configure itself.");
            return false;
        }
        // Now that we have our RTSP streams, create a list of supported resolutions for HomeKit.
        for (const channel of cameraChannels) {
            // Sanity check in case Protect reports nonsensical resolutions.
            if (!channel.name || (channel.width <= 0) || (channel.width > 65535) || (channel.height <= 0) || (channel.height > 65535)) {
                continue;
            }
            rtspEntries.push({ channel: channel,
                name: this.getResolution([channel.width, channel.height, channel.fps]) + " (" + channel.name + ")",
                resolution: [channel.width, channel.height, channel.fps], url: cameraUrl + channel.rtspAlias + "?enableSrtp" });
        }
        // Inform users about our which RTSP streams we found.
        for (const entry of this.rtspEntries) {
            this.log.info("%s: Found resolution: %s.", this.name(), this.getResolution(entry.resolution));
        }
        // Sort the list of resolutions, from high to low.
        rtspEntries.sort(this.sortByResolutions.bind(this));
        // Next, ensure we have mandatory resolutions required by HomeKit, as well as special support for Apple TV and Apple Watch:
        //   3840x2160@30 (4k).
        //   1920x1080@30 (1080p).
        //   1280x720@30 (720p).
        //   320x240@15 (Apple Watch).
        /*
        for(const entry of [ [3840, 2160, 30], [1920, 1080, 30], [1280, 720, 30], [320, 240, 15] ] ) {
    
          // We already have this resolution in our list.
          if(rtspEntries.some(x => (x.resolution[0] === entry[0]) && (x.resolution[1] === entry[1]) && (x.resolution[2] === entry[2]))) {
            continue;
          }
    
          // Find the closest RTSP match for this resolution.
          const foundRtsp = this.findRtsp(entry[0], entry[1], undefined, undefined, rtspEntries);
    
          if(!foundRtsp) {
            continue;
          }
    
          // Add the resolution to the list of supported resolutions.
          rtspEntries.push({ channel: foundRtsp.channel, name: foundRtsp.name, resolution: [ entry[0], entry[1], entry[2] ], url: foundRtsp.url });
    
          // Since we added resolutions to the list, resort resolutions, from high to low.
          rtspEntries.sort(this.sortByResolutions.bind(this));
        }
        */
        // Publish our updated list of supported resolutions and their URLs.
        this.rtspEntries = rtspEntries;
        // If we're already configured, we're done here.
        if (this.isVideoConfigured) {
            return true;
        }
        // Inform users about our RTSP entry mapping, if we're debugging.
        if (nvr.optionEnabled(device, "Debug.Video.Startup", false)) {
            for (const entry of this.rtspEntries) {
                this.log.info("%s: Mapping resolution: %s.", this.name(), this.getResolution(entry.resolution) + " => " + entry.name);
            }
        }
        // Check for explicit RTSP profile preferences.
        for (const rtspProfile of ["LOW", "MEDIUM", "HIGH"]) {
            // Check to see if the user has requested a specific streaming profile for this camera.
            if (nvr.optionEnabled(device, "Video.Stream.Only." + rtspProfile, false)) {
                this.rtspQuality.StreamingDefault = rtspProfile;
            }
            // Check to see if the user has requested a specific recording profile for this camera.
            if (nvr.optionEnabled(device, "Video.HKSV.Recording.Only." + rtspProfile, false)) {
                this.rtspQuality.RecordingDefault = rtspProfile;
            }
        }
        // Inform the user if we've set a streaming default.
        if (this.rtspQuality.StreamingDefault) {
            this.log.info("%s: Video streaming configured to use only: %s.", this.name(), this.rtspQuality.StreamingDefault.charAt(0) + this.rtspQuality.StreamingDefault.slice(1).toLowerCase());
        }
        // Inform the user if we've set a recording default.
        if (this.rtspQuality.RecordingDefault) {
            this.log.info("%s: HomeKit Secure Video event recording configured to use only: %s.", this.name(), this.rtspQuality.RecordingDefault.charAt(0) + this.rtspQuality.RecordingDefault.slice(1).toLowerCase());
        }
        // Configure the video stream with our resolutions.
        this.stream = new protect_stream_1.ProtectStreamingDelegate(this, this.rtspEntries.map(x => x.resolution));
        // Fire up the controller and inform HomeKit about it.
        this.accessory.configureController(this.stream.controller);
        this.isVideoConfigured = true;
        return true;
    }
    // Configure HomeKit Secure Video support.
    configureHksv() {
        var _a, _b, _c, _d;
        const device = this.accessory.context.device;
        // If we've explicitly disabled HomeKit Secure Video support, we're done.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Video.HKSV", true))) {
            this.log.info("%s: HomeKit Secure Video support disabled.", this.name());
            return false;
        }
        // HomeKit Secure Video support requires an enabled motion sensor. If one isn't enabled, we're done.
        if (!((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(device, "Motion.Sensor"))) {
            this.log.info("%s: Disabling HomeKit Secure Video support. You must enable motion sensor support in order to use HomeKit Secure Video.", this.name());
            return false;
        }
        this.isHksv = true;
        this.log.info("%s: HomeKit Secure Video support enabled.", this.name());
        // If we have smart motion events enabled, let's warn the user that things will not work quite the way they expect.
        if (device.featureFlags.hasSmartDetect && ((_c = this.nvr) === null || _c === void 0 ? void 0 : _c.optionEnabled(device, "Motion.SmartDetect", false))) {
            this.log.info("%s: WARNING: Smart motion detection and HomeKit Secure Video provide overlapping functionality. " +
                "Only HomeKit Secure Video, when event recording is enabled in the Home app, will be used to trigger motion event notifications for this camera." +
                (((_d = this.nvr) === null || _d === void 0 ? void 0 : _d.optionEnabled(device, "Motion.SmartDetect.ObjectSensors", false)) ?
                    " Smart motion contact sensors will continue to function using telemetry from UniFi Protect." : ""), this.name());
        }
        return true;
    }
    // Configure a switch to manually enable or disable HKSV recording for a camera.
    configureHksvRecordingSwitch() {
        var _a, _b, _c;
        // Find the switch service, if it exists.
        let switchService = this.accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_HKSV_RECORDING);
        // If we don't have HKSV or the HKSV recording switch enabled, disable it and we're done.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Video.HKSV")) ||
            !((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Video.HKSV.Recording.Switch", false))) {
            if (switchService) {
                this.accessory.removeService(switchService);
            }
            // We want to default this back to recording whenever we disable the recording switch.
            this.accessory.context.hksvRecording = true;
            return false;
        }
        // Add the switch to the camera, if needed.
        if (!switchService) {
            switchService = new this.hap.Service.Switch(this.accessory.displayName + " HKSV Recording", protect_accessory_1.ProtectReservedNames.SWITCH_HKSV_RECORDING);
            if (!switchService) {
                this.log.error("%s: Unable to add the HomeKit Secure Video recording switch.", this.name());
                return false;
            }
            this.accessory.addService(switchService);
        }
        // Activate or deactivate HKSV recording.
        (_c = switchService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _c === void 0 ? void 0 : _c.onGet(() => {
            return this.accessory.context.hksvRecording;
        }).onSet((value) => {
            if (this.accessory.context.hksvRecording !== value) {
                this.log.info("%s: HomeKit Secure Video event recording has been %s.", this.name(), value === true ? "enabled" : "disabled");
            }
            this.accessory.context.hksvRecording = value === true;
        });
        // Initialize the switch.
        switchService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.hksvRecording);
        this.log.info("%s: Enabling HomeKit Secure Video recording switch.", this.name());
        return true;
    }
    // Configure a switch to manually enable or disable dynamic bitrate capabilities for a camera.
    configureDynamicBitrateSwitch() {
        var _a, _b;
        // Find the switch service, if it exists.
        let switchService = this.accessory.getServiceById(this.hap.Service.Switch, protect_accessory_1.ProtectReservedNames.SWITCH_DYNAMIC_BITRATE);
        // If we don't want a dynamic bitrate switch, disable it and we're done.
        if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Video.DynamicBitrate.Switch", false))) {
            if (switchService) {
                this.accessory.removeService(switchService);
            }
            // We want to default this back to off by default whenever we disable the dynamic bitrate switch.
            this.accessory.context.dynamicBitrate = false;
            return false;
        }
        // Add the switch to the camera, if needed.
        if (!switchService) {
            switchService = new this.hap.Service.Switch(this.accessory.displayName + " Dynamic Bitrate", protect_accessory_1.ProtectReservedNames.SWITCH_DYNAMIC_BITRATE);
            if (!switchService) {
                this.log.error("%s: Unable to add the dynamic bitrate switch.", this.name());
                return false;
            }
            this.accessory.addService(switchService);
        }
        // Activate or deactivate dynamic bitrate for this device.
        (_b = switchService
            .getCharacteristic(this.hap.Characteristic.On)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
            return this.accessory.context.dynamicBitrate;
        }).onSet(async (value) => {
            if (this.accessory.context.dynamicBitrate === value) {
                return;
            }
            // We're enabling dynamic bitrate for this device.
            if (value) {
                this.accessory.context.dynamicBitrate = true;
                this.log.info("%s: Dynamic streaming bitrate adjustment on the UniFi Protect controller enabled.", this.name());
                return;
            }
            // We're disabling dynamic bitrate for this device.
            const device = this.accessory.context.device;
            const updatedChannels = device.channels;
            // Update the channels JSON.
            for (const channel of updatedChannels) {
                channel.bitrate = channel.maxBitrate;
            }
            // Send the channels JSON to Protect.
            const newDevice = await this.nvrApi.updateCamera(device, { channels: updatedChannels });
            // We failed.
            if (!newDevice) {
                this.log.error("%s: Unable to set the streaming bitrate to %s.", this.name(), value);
            }
            else {
                this.accessory.context.device = newDevice;
            }
            this.accessory.context.dynamicBitrate = false;
            this.log.info("%s: Dynamic streaming bitrate adjustment on the UniFi Protect controller disabled.", this.name());
        });
        // Initialize the switch.
        switchService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.dynamicBitrate);
        this.log.info("%s: Enabling the dynamic streaming bitrate adjustment switch.", this.name());
        return true;
    }
    // Configure a series of switches to manually enable or disable recording on the UniFi Protect controller for a camera.
    configureNvrRecordingSwitch() {
        var _a, _b;
        const switchesEnabled = [];
        // The Protect controller supports three modes for recording on a camera: always, detections, and never. We create switches for each of the modes.
        for (const ufpRecordingSwitchType of [protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_ALWAYS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_DETECTIONS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_NEVER]) {
            const ufpRecordingSetting = ufpRecordingSwitchType.slice(ufpRecordingSwitchType.lastIndexOf(".") + 1);
            // Find the switch service, if it exists.
            let switchService = this.accessory.getServiceById(this.hap.Service.Switch, ufpRecordingSwitchType);
            // If we don't have the feature option enabled, disable the switch and we're done.
            if (!((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Nvr.Recording.Switch", false))) {
                if (switchService) {
                    this.accessory.removeService(switchService);
                }
                continue;
            }
            // Add the switch to the camera, if needed.
            if (!switchService) {
                switchService = new this.hap.Service.Switch(this.accessory.displayName + " UFP Recording " + ufpRecordingSetting.charAt(0).toUpperCase() + ufpRecordingSetting.slice(1), ufpRecordingSwitchType);
                if (!switchService) {
                    this.log.error("%s: Unable to add the UniFi Protect recording switches.", this.name());
                    continue;
                }
                this.accessory.addService(switchService);
            }
            // Activate or deactivate the appropriate recording mode on the Protect controller.
            (_b = switchService
                .getCharacteristic(this.hap.Characteristic.On)) === null || _b === void 0 ? void 0 : _b.onGet(() => {
                return this.accessory.context.device.recordingSettings.mode === ufpRecordingSetting;
            }).onSet(async (value) => {
                var _a;
                // We only want to do something if we're being activated. Turning off the switch would really be an undefined state given that
                // there are three different settings one can choose from. Instead, we do nothing and leave it to the user to choose what state
                // they really want to set.
                if (!value) {
                    setTimeout(() => {
                        this.updateDevice();
                    }, 50);
                    return;
                }
                // Set our recording mode.
                const device = this.accessory.context.device;
                device.recordingSettings.mode = ufpRecordingSetting;
                // Tell Protect about it.
                const newDevice = await this.nvr.nvrApi.updateCamera(device, { recordingSettings: device.recordingSettings });
                if (!newDevice) {
                    this.log.error("%s: Unable to set the UniFi Protect recording mode to %s.", this.name(), ufpRecordingSetting);
                    return false;
                }
                // Save our updated device context.
                this.accessory.context.device = newDevice;
                // Update all the other recording switches.
                for (const otherUfpSwitch of [protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_ALWAYS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_DETECTIONS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_NEVER]) {
                    // Don't update ourselves a second time.
                    if (ufpRecordingSwitchType === otherUfpSwitch) {
                        continue;
                    }
                    // Update the other recording switches.
                    (_a = this.accessory.getServiceById(this.hap.Service.Switch, otherUfpSwitch)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.On, false);
                }
                // Inform the user, and we're done.
                this.log.info("%s: UniFi Protect recording mode set to %s.", this.name(), ufpRecordingSetting);
            });
            // Initialize the recording switch state.
            switchService.updateCharacteristic(this.hap.Characteristic.On, this.accessory.context.device.recordingSettings.mode === ufpRecordingSetting);
            switchesEnabled.push(ufpRecordingSetting);
        }
        if (switchesEnabled.length) {
            this.log.info("%s: Enabling UniFi Protect recording switches: %s.", this.name(), switchesEnabled.join(", "));
        }
        return true;
    }
    // Configure MQTT capabilities of this camera.
    configureMqtt() {
        var _a, _b;
        const bootstrap = this.nvr.nvrApi.bootstrap;
        const device = this.accessory.context.device;
        // Return the RTSP URLs when requested.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(this.accessory, "rtsp/get", (message) => {
            var _a;
            const value = message.toString();
            // When we get the right message, we trigger the snapshot request.
            if ((value === null || value === void 0 ? void 0 : value.toLowerCase()) !== "true") {
                return;
            }
            const urlInfo = {};
            // Grab all the available RTSP channels.
            for (const channel of device.channels) {
                if (!bootstrap || !channel.isRtspEnabled) {
                    continue;
                }
                urlInfo[channel.name] = "rtsps://" + bootstrap.nvr.host + ":" + bootstrap.nvr.ports.rtsp.toString() + "/" + channel.rtspAlias + "?enableSrtp";
            }
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(this.accessory, "rtsp", JSON.stringify(urlInfo));
            this.log.info("%s: RTSP information published via MQTT.", this.name());
        });
        // Trigger snapshots when requested.
        (_b = this.nvr.mqtt) === null || _b === void 0 ? void 0 : _b.subscribe(this.accessory, "snapshot/trigger", (message) => {
            var _a;
            const value = message.toString();
            // When we get the right message, we trigger the snapshot request.
            if ((value === null || value === void 0 ? void 0 : value.toLowerCase()) !== "true") {
                return;
            }
            void ((_a = this.stream) === null || _a === void 0 ? void 0 : _a.handleSnapshotRequest());
            this.log.info("%s: Snapshot triggered via MQTT.", this.name());
        });
        return true;
    }
    // Refresh camera-specific characteristics.
    updateDevice() {
        var _a, _b, _c;
        // Grab our device context.
        const device = this.accessory.context.device;
        // Update the camera state.
        (_a = this.accessory.getService(this.hap.Service.MotionSensor)) === null || _a === void 0 ? void 0 : _a.updateCharacteristic(this.hap.Characteristic.StatusActive, device.state === "CONNECTED");
        // Find the service, if it exists.
        const service = this.accessory.getService(this.hap.Service.CameraOperatingMode);
        // Check to see if this device has a status light.
        if (device.featureFlags.hasLedStatus) {
            service === null || service === void 0 ? void 0 : service.updateCharacteristic(this.hap.Characteristic.CameraOperatingModeIndicator, device.ledSettings.isEnabled === true);
        }
        // Check for updates to the recording state, if we have the switches configured.
        if ((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(device, "Nvr.Recording.Switch", false)) {
            // Update all the switch states.
            for (const ufpRecordingSwitchType of [protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_ALWAYS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_DETECTIONS, protect_accessory_1.ProtectReservedNames.SWITCH_UFP_RECORDING_NEVER]) {
                const ufpRecordingSetting = ufpRecordingSwitchType.slice(ufpRecordingSwitchType.lastIndexOf(".") + 1);
                // Update state based on the recording mode.
                (_c = this.accessory.getServiceById(this.hap.Service.Switch, ufpRecordingSwitchType)) === null || _c === void 0 ? void 0 : _c.updateCharacteristic(this.hap.Characteristic.On, ufpRecordingSetting === device.recordingSettings.mode);
            }
        }
        return true;
    }
    // Get the current bitrate for a specific camera channel.
    getBitrate(channelId) {
        var _a;
        // Grab the device JSON.
        const device = this.accessory.context.device;
        // Find the right channel.
        const channel = device.channels.find(x => x.id === channelId);
        return (_a = channel === null || channel === void 0 ? void 0 : channel.bitrate) !== null && _a !== void 0 ? _a : -1;
    }
    // Set the bitrate for a specific camera channel.
    async setBitrate(channelId, value) {
        var _a, _b, _c;
        // If we've disabled the ability to set the bitrate dynamically, silently fail. We prioritize switches over the global
        // setting here, in case the user enabled both, using the principle that the most specific setting always wins. If the
        // user has both the global setting and the switch enabled, the switch setting will take precedence.
        if ((!this.accessory.context.dynamicBitrate &&
            !((_a = this.nvr) === null || _a === void 0 ? void 0 : _a.optionEnabled(this.accessory.context.device, "Video.DynamicBitrate", false))) ||
            (!this.accessory.context.dynamicBitrate &&
                ((_b = this.nvr) === null || _b === void 0 ? void 0 : _b.optionEnabled(this.accessory.context.device, "Video.DynamicBitrate", false)) &&
                ((_c = this.nvr) === null || _c === void 0 ? void 0 : _c.optionEnabled(this.accessory.context.device, "Video.DynamicBitrate.Switch", false)))) {
            return true;
        }
        // Grab the device JSON.
        const device = this.accessory.context.device;
        // Find the right channel.
        const channel = device.channels.find(x => x.id === channelId);
        // No channel, we're done.
        if (!channel) {
            return false;
        }
        // If our correct bitrate is already set, we're done.
        if (channel.bitrate === value) {
            return true;
        }
        // Make sure the requested bitrate fits within the constraints of what this channel can do.
        channel.bitrate = Math.min(channel.maxBitrate, Math.max(channel.minBitrate, value));
        // Tell Protect about it.
        const newDevice = await this.nvr.nvrApi.updateCamera(device, { channels: device.channels });
        if (!newDevice) {
            this.log.error("%s: Unable to set the streaming bitrate to %s.", this.name(), value);
            return false;
        }
        // Save our updated device context.
        this.accessory.context.device = newDevice;
        return true;
    }
    // Find an RTSP configuration for a given target resolution.
    findRtspEntry(width, height, camera, address, rtspEntries, defaultStream = this.rtspQuality.StreamingDefault) {
        var _a, _b;
        // No RTSP entries to choose from, we're done.
        if (!rtspEntries || !rtspEntries.length) {
            return null;
        }
        // First, we check to see if we've set an explicit preference for the target address.
        if (camera && address) {
            // If we don't have this address cached, look it up and cache it.
            if (!this.rtspQuality[address]) {
                // Check to see if there's an explicit preference set and cache the result.
                if (this.nvr.optionEnabled(camera, "Video.Stream.Only.Low", false, address, true)) {
                    this.rtspQuality[address] = "LOW";
                }
                else if (this.nvr.optionEnabled(camera, "Video.Stream.Only.Medium", false, address, true)) {
                    this.rtspQuality[address] = "MEDIUM";
                }
                else if (this.nvr.optionEnabled(camera, "Video.Stream.Only.High", false, address, true)) {
                    this.rtspQuality[address] = "HIGH";
                }
                else {
                    this.rtspQuality[address] = "None";
                }
            }
            // If it's set to none, we default to our normal lookup logic.
            if (this.rtspQuality[address] !== "None") {
                return (_a = rtspEntries.find(x => x.channel.name.toUpperCase() === this.rtspQuality[address])) !== null && _a !== void 0 ? _a : null;
            }
        }
        // Second, we check to see if we've set an explicit preference for stream quality.
        if (defaultStream) {
            return (_b = rtspEntries.find(x => x.channel.name.toUpperCase() === defaultStream)) !== null && _b !== void 0 ? _b : null;
        }
        // See if we have a match for our desired resolution on the camera. We ignore FPS - HomeKit clients seem
        // to be able to handle it just fine.
        const exactRtsp = rtspEntries.find(x => (x.resolution[0] === width) && (x.resolution[1] === height));
        if (exactRtsp) {
            return exactRtsp;
        }
        // No match found, let's see what we have that's closest. We try to be a bit smart about how we select our
        // stream - if it's an HD quality stream request (720p+), we want to try to return something that's HD quality
        // before looking for something lower resolution.
        if ((width >= 1280) && (height >= 720)) {
            for (const entry of rtspEntries) {
                // Make sure we're looking at an HD resolution.
                if (entry.resolution[0] < 1280) {
                    continue;
                }
                // Return the first one we find.
                return entry;
            }
        }
        // If we didn't request an HD resolution, or we couldn't find anything HD to use, we try to find whatever we
        // can find that's close.
        for (const entry of rtspEntries) {
            if (width >= entry.resolution[0]) {
                return entry;
            }
        }
        // We couldn't find a close match, return the lowest resolution we found.
        return rtspEntries[rtspEntries.length - 1];
    }
    // Find a streaming RTSP configuration for a given target resolution.
    findRtsp(width, height, camera = null, address = "", rtspEntries = this.rtspEntries) {
        return this.findRtspEntry(width, height, camera, address, rtspEntries);
    }
    // Find a recording RTSP configuration for a given target resolution.
    findRecordingRtsp(width, height, camera = null, rtspEntries = this.rtspEntries) {
        return this.findRtspEntry(width, height, camera, "", rtspEntries, this.rtspQuality.RecordingDefault);
    }
    // Utility function for sorting by resolution.
    sortByResolutions(a, b) {
        // Check width.
        if (a.resolution[0] < b.resolution[0]) {
            return 1;
        }
        if (a.resolution[0] > b.resolution[0]) {
            return -1;
        }
        // Check height.
        if (a.resolution[1] < b.resolution[1]) {
            return 1;
        }
        if (a.resolution[1] > b.resolution[1]) {
            return -1;
        }
        // Check FPS.
        if (a.resolution[2] < b.resolution[2]) {
            return 1;
        }
        if (a.resolution[2] > b.resolution[2]) {
            return -1;
        }
        return 0;
    }
    // Utility function to format resolution entries.
    getResolution(resolution) {
        return resolution[0].toString() + "x" + resolution[1].toString() + "@" + resolution[2].toString() + "fps";
    }
}
exports.ProtectCamera = ProtectCamera;
//# sourceMappingURL=protect-camera.js.map