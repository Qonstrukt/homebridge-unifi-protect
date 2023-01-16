"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectMqtt = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const settings_1 = require("./settings");
class ProtectMqtt {
    constructor(nvr) {
        this.config = nvr.config;
        this.debug = nvr.platform.debug.bind(nvr.platform);
        this.isConnected = false;
        this.log = nvr.platform.log;
        this.mqtt = null;
        this.nvr = nvr;
        this.nvrApi = nvr.nvrApi;
        this.subscriptions = {};
        if (!this.config.mqttUrl) {
            return;
        }
        this.configure();
    }
    // Connect to the MQTT broker.
    configure() {
        // Try to connect to the MQTT broker and make sure we catch any URL errors.
        try {
            this.mqtt = mqtt_1.default.connect(this.config.mqttUrl, { reconnectPeriod: settings_1.PROTECT_MQTT_RECONNECT_INTERVAL * 1000, rejectUnauthorized: false });
        }
        catch (error) {
            if (error instanceof Error) {
                switch (error.message) {
                    case "Missing protocol":
                        this.log.error("%s MQTT Broker: Invalid URL provided: %s.", this.nvrApi.getNvrName(), this.config.mqttUrl);
                        break;
                    default:
                        this.log.error("%s MQTT Broker: Error: %s.", this.nvrApi.getNvrName(), error.message);
                        break;
                }
            }
        }
        // We've been unable to even attempt to connect. It's likely we have a configuration issue - we're done here.
        if (!this.mqtt) {
            return;
        }
        // Notify the user when we connect to the broker.
        this.mqtt.on("connect", () => {
            this.isConnected = true;
            // Magic incantation to redact passwords.
            const redact = /^(?<pre>.*:\/{0,2}.*:)(?<pass>.*)(?<post>@.*)/;
            this.log.info("%s: Connected to MQTT broker: %s (topic: %s).", this.nvrApi.getNvrName(), this.config.mqttUrl.replace(redact, "$<pre>REDACTED$<post>"), this.config.mqttTopic);
        });
        // Notify the user when we've disconnected.
        this.mqtt.on("close", () => {
            if (this.isConnected) {
                this.isConnected = false;
                this.log.info("%s: Disconnected from MQTT broker: %s.", this.nvrApi.getNvrName(), this.config.mqttUrl);
            }
        });
        // Process inbound messages and pass it to the right message handler.
        this.mqtt.on("message", (topic, message) => {
            if (this.subscriptions[topic]) {
                this.subscriptions[topic](message);
            }
        });
        // Notify the user when there's a connectivity error.
        this.mqtt.on("error", (error) => {
            var _a;
            switch (error.code) {
                case "ECONNREFUSED":
                    this.log.error("%s MQTT Broker: Connection refused (url: %s). Will retry again in %s minute%s.", this.nvrApi.getNvrName(), this.config.mqttUrl, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s" : "");
                    break;
                case "ECONNRESET":
                    this.log.error("%s MQTT Broker: Connection reset (url: %s). Will retry again in %s minute%s.", this.nvrApi.getNvrName(), this.config.mqttUrl, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s" : "");
                    break;
                case "ENOTFOUND":
                    (_a = this.mqtt) === null || _a === void 0 ? void 0 : _a.end(true);
                    this.log.error("%s MQTT Broker: Hostname or IP address not found. (url: %s).", this.nvrApi.getNvrName(), this.config.mqttUrl);
                    break;
                default:
                    this.log.error("%s MQTT Broker: %s (url: %s). Will retry again in %s minute%s.", this.nvrApi.getNvrName(), error, this.config.mqttUrl, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60, settings_1.PROTECT_MQTT_RECONNECT_INTERVAL / 60 > 1 ? "s" : "");
                    break;
            }
        });
    }
    // Publish an MQTT event to a broker.
    publish(accessory, topic, message) {
        var _a;
        const expandedTopic = this.expandTopic(accessory, topic);
        // No valid topic returned, we're done.
        if (!expandedTopic) {
            return;
        }
        this.debug("%s: MQTT publish: %s Message: %s.", this.nvrApi.getNvrName(), expandedTopic, message);
        // By default, we publish as: unifi/protect/mac/event/name
        (_a = this.mqtt) === null || _a === void 0 ? void 0 : _a.publish(expandedTopic, message);
    }
    // Subscribe to an MQTT topic.
    subscribe(accessory, topic, callback) {
        var _a;
        const expandedTopic = this.expandTopic(accessory, topic);
        // No valid topic returned, we're done.
        if (!expandedTopic) {
            return;
        }
        this.debug("%s: MQTT subscribe: %s.", this.nvrApi.getNvrName(), expandedTopic);
        // Add to our callback list.
        this.subscriptions[expandedTopic] = callback;
        // Tell MQTT we're subscribing to this event.
        // By default, we subscribe as: unifi/protect/mac/event/name.
        (_a = this.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(expandedTopic);
    }
    // Subscribe to a specific MQTT topic and publish a value on a get request.
    subscribeGet(accessory, name, topic, type, getValue) {
        var _a;
        // Return the current status of a given sensor.
        (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.subscribe(accessory, topic + "/get", (message) => {
            var _a;
            const value = message.toString().toLowerCase();
            // When we get the right message, we return the system information JSON.
            if (value !== "true") {
                return;
            }
            (_a = this.nvr.mqtt) === null || _a === void 0 ? void 0 : _a.publish(accessory, topic, getValue());
            this.log.info("%s: %s information published via MQTT.", name, type);
        });
    }
    // Unsubscribe to an MQTT topic.
    unsubscribe(accessory, topic) {
        const expandedTopic = this.expandTopic(accessory, topic);
        // No valid topic returned, we're done.
        if (!expandedTopic) {
            return;
        }
        delete this.subscriptions[expandedTopic];
    }
    // Expand a topic to a unique, fully formed one.
    expandTopic(accessory, topic) {
        // No accessory, we're done.
        if (!accessory) {
            return null;
        }
        // Check if we were passed the MAC as an input. Otherwise, assume it's the controller's MAC initially.
        let mac = (typeof accessory === "string") ? accessory : accessory.context.nvr;
        // Check to see if it's really a Protect device...if it is, use it's MAC address.
        if ((typeof accessory !== "string") && ("device" in accessory.context)) {
            mac = accessory.context.device.mac;
        }
        const expandedTopic = this.config.mqttTopic + "/" + mac + "/" + topic;
        return expandedTopic;
    }
}
exports.ProtectMqtt = ProtectMqtt;
//# sourceMappingURL=protect-mqtt.js.map