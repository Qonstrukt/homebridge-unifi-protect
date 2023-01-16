"use strict";
/* Copyright(C) 2017-2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: homebridge-unifi-protect plugin registration.
 */
const settings_1 = require("./settings");
const protect_platform_1 = require("./protect-platform");
module.exports = (api) => {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, protect_platform_1.ProtectPlatform);
};
//# sourceMappingURL=index.js.map