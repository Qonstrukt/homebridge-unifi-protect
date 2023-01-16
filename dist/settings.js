"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTECT_HKSV_BUFFER_LENGTH = exports.PROTECT_HKSV_SEGMENT_LENGTH = exports.PROTECT_HKSV_SEGMENT_RESOLUTION = exports.PROTECT_TWOWAY_HEARTBEAT_INTERVAL = exports.PROTECT_RING_DURATION = exports.PROTECT_NVR_UNIFIOS_REFRESH_INTERVAL = exports.PROTECT_MQTT_TOPIC = exports.PROTECT_MQTT_RECONNECT_INTERVAL = exports.PROTECT_MOTION_DURATION = exports.PROTECT_LOGIN_REFRESH_INTERVAL = exports.PROTECT_HOMEKIT_IDR_INTERVAL = exports.PROTECT_FFMPEG_OPTIONS = exports.PROTECT_FFMPEG_AUDIO_FILTER_LOWPASS = exports.PROTECT_FFMPEG_AUDIO_FILTER_HIGHPASS = exports.PROTECT_FFMPEG_AUDIO_FILTER_FFTNR = exports.PROTECT_EVENTS_HEARTBEAT_INTERVAL = exports.PROTECT_API_TIMEOUT = exports.PROTECT_API_RETRY_INTERVAL = exports.PROTECT_API_ERROR_LIMIT = exports.PLATFORM_NAME = exports.PLUGIN_NAME = void 0;
/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-unifi-protect.
 */
// The name of our plugin.
exports.PLUGIN_NAME = "homebridge-unifi-protect";
// The platform the plugin creates.
exports.PLATFORM_NAME = "UniFi Protect";
// Number of API errors to accept before we implement backoff so we don't slam a Protect controller.
exports.PROTECT_API_ERROR_LIMIT = 10;
// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
exports.PROTECT_API_RETRY_INTERVAL = 300;
// Protect API response timeout, in seconds. This should never be greater than 5 seconds.
exports.PROTECT_API_TIMEOUT = 3.5;
// Heartbeat interval, in seconds, for the realtime Protect API on UniFI OS devices.
// UniFi OS expects to hear from us every 15 seconds.
exports.PROTECT_EVENTS_HEARTBEAT_INTERVAL = 10;
// FFmpeg afftdn audio filter defaults - this setting uses FFTs to reduce noise in an audio signal by the number of decibels below.
exports.PROTECT_FFMPEG_AUDIO_FILTER_FFTNR = 90;
// FFmpeg highpass audio filter defaults - this setting attenuates (eliminates) frequencies below the value.
exports.PROTECT_FFMPEG_AUDIO_FILTER_HIGHPASS = 200;
// FFmpeg lowpass audio filter defaults - this setting attenuates (eliminates) frequencies above the value.
exports.PROTECT_FFMPEG_AUDIO_FILTER_LOWPASS = 1000;
// Magic incantantion to further streamline FFmpeg for Protect.
exports.PROTECT_FFMPEG_OPTIONS = [];
// HomeKit prefers a video streaming I-frame interval of 4 seconds.
exports.PROTECT_HOMEKIT_IDR_INTERVAL = 4;
// How often, in seconds, should we refresh our Protect login credentials.
exports.PROTECT_LOGIN_REFRESH_INTERVAL = 1800;
// Default duration, in seconds, of motion events. Setting this too low will potentially cause a lot of notification spam.
exports.PROTECT_MOTION_DURATION = 10;
// How often, in seconds, should we try to reconnect with an MQTT broker, if we have one configured.
exports.PROTECT_MQTT_RECONNECT_INTERVAL = 60;
// Default MQTT topic to use when publishing events. This is in the form of: unifi/protect/camera/event
exports.PROTECT_MQTT_TOPIC = "unifi/protect";
// How often, in seconds, should we check Protect controllers for new or removed devices.
// This will NOT impact motion or doorbell event detection on UniFi OS devices.
exports.PROTECT_NVR_UNIFIOS_REFRESH_INTERVAL = 10;
// Default duration, in seconds, of ring events.
exports.PROTECT_RING_DURATION = 3;
// How often, in seconds, should we heartbeat FFmpeg in two-way audio sessions. This should be less than 5 seconds, which is
// FFmpeg's input timeout interval.
exports.PROTECT_TWOWAY_HEARTBEAT_INTERVAL = 3;
// HomeKit Secure Video segment resolution, in milliseconds. This defines the resolution of our buffer. It should never be
// less than 100ms or greater than 1500ms.
exports.PROTECT_HKSV_SEGMENT_RESOLUTION = 200;
// HomeKit Secure Video segment length, in milliseconds. HomeKit only supports this value currently.
exports.PROTECT_HKSV_SEGMENT_LENGTH = 4000;
// HomeKit Secure Video buffer length, in milliseconds. This defines how far back in time we can look when we see a motion event.
exports.PROTECT_HKSV_BUFFER_LENGTH = exports.PROTECT_HKSV_SEGMENT_LENGTH * 2;
//# sourceMappingURL=settings.js.map