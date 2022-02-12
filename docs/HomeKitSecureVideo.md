<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![homebridge-unifi-protect: Native HomeKit support for UniFi Protect](https://raw.githubusercontent.com/hjdhjd/homebridge-unifi-protect/master/homebridge-protect.svg)](https://github.com/hjdhjd/homebridge-unifi-protect)

# Homebridge UniFi Protect

[![Downloads](https://img.shields.io/npm/dt/homebridge-unifi-protect?color=%230559C9&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-unifi-protect)
[![Version](https://img.shields.io/npm/v/homebridge-unifi-protect?color=%230559C9&label=Homebridge%20UniFi%20Protect&logo=ubiquiti&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-unifi-protect)
[![UniFi Protect@Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=0559C9&label=Discord&logo=discord&logoColor=%23FFFFFF&style=for-the-badge)](https://discord.gg/QXqfHEW)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## HomeKit support for the UniFi Protect ecosystem using [Homebridge](https://homebridge.io).
</DIV>
</SPAN>

`homebridge-unifi-protect` is a [Homebridge](https://homebridge.io) plugin that provides HomeKit support to the [UniFi Protect](https://unifi-network.ui.com/video-security) device ecosystem. [UniFi Protect](https://unifi-network.ui.com/video-security) is [Ubiquiti's](https://www.ui.com) next-generation video security platform, with rich camera, doorbell, and other smart home options for you to choose from, as well as an app which you can use to view, configure and manage your video camera, doorbells, and more.

### HomeKit Secure Video Support
HomeKit Secure Video has been a feature in HomeKit since the launch of iOS 13. It provides for several things:

  * The ability to securely record and store motion events of interest using a HomeKit hub (Apple TV, HomePod mini, etc.).
  * Intelligent analysis of those events for specific things like animals, people, and vehicles.
  * Granular notifications based on the analysis of those events.

`homebridge-unifi-protect` fully supports HomeKit Secure Video, without the need for additional software or plugins. We use the UniFi Protect livestream API and FFmpeg to provide a seamless native user experience.

So how does this work in practice?

  * Once you enable HomeKit Secure Video for your cameras in the Home app, you con configure the types of events you're interested in recording and being informed about.
  * On a technical level, HKSV asks `homebridge-unifi-protect` to maintain a buffer - a few seconds of video (in practice, HomeKit always requests four seconds of history). Think of this buffer like a timeshifting DVR that's constantly updating. When a motion event occurs, we send the buffer to HomeKit, and continue to do so as long as HomeKit requests it.
  * It's important to note: **HomeKit decides how long each event will be, by default**. In practice, I've seen events as long 5 or 10 minutes in high-traffic areas. HomeKit continues to record an event for as long as it thinks there's some motion of interest to the user.
  * In practice, if you a camera in a very high traffic area, say a kitchen or a family room, you're going to get very long motion events captured in HomeKit. It's not a bug, it's the way HomeKit Secure Video is designed. :smile: You can modify this behavior with the [`Video.HKSV.Recording.MaxDuration` feature option](https://github.com/hjdhjd/homebridge-unifi-protect/blob/master/docs/FeatureOptions.md#video), which allows you to set an upward limit on how long each HKSV event recording can be.

#### Interactions With UniFi Protect Smart Motion Detection
UniFi Protect has it's own smart motion detection capabilities that [can be used](https://github.com/hjdhjd/homebridge-unifi-protect/blob/master/docs/FeatureOptions.md#motion) with `homebridge-unifi-protect`. When you have smart motion detection enabled and you have HomeKit Secure Video is enabled **and** configured in the Home app to record events, `homebridge-unifi-protect` is faced with a dilemma: when do I notify a user of a motion detection event?

When HKSV is both enabled and configured, `homebridge-unifi-protect` will not use the smart motion detection capabilities of UniFi Protect to alert you to a motion event and instead use HKSV to do so. Why? If the user has made an active decision to enable HKSV, we need to let HomeKit determine when to notify the user of an event of interest, and only HKSV. Otherwise, you run the risk of being spammed with motion event notifications, or missing motion events altogether.

However, if you have the smart motion detection object sensors feature option enabled (`Motion.SmartDetect.ObjectSensors`), you will still receive contact sensor updates for those object types as UniFi Protect detects them. It's important to note: smart object contact sensors are not related, nor connected, to HKSV. HKSV is a bit of a black box and handles everything independently without or knowledge or ability to know what it's detected by design. It's entirely possible that the smart object sensors will detect (or not detect) a certain object that HKSV does or doesn't detect.

#### Things To Be Aware Of
  * HomeKit hubs are quite particular about the exact format of the video it receives. We use FFmpeg to transcode the video to the exact format HomeKit is requesting. In practice, even in large camera environments, this shouldn't result in a degradation in performance. We try to match the input stream to FFmpeg as closely as we can to what HomeKit is looking for, minimizing most of the computing overhead associated with transcoding.
  * Occasional errors will occur - HomeKit hubs can be finicky at times. It's not typically something to be concerned about, and please don't open issues for infrequent errors that will be logged. As both HKSV and `homebridge-unifi-protect` continue to evolve, these will become more and more rare instances.

### Some Fun Facts
  * I've had HKSV events run as long as 10+ minutes and they work quite well.
  * The video quality that HKSV requests can be quite a bit less than the video quality of the native UniFi Protect camera capabilities, particularly for 4K-capable cameras.
  * HKSV can almost be thought of as HomeKit camera implementation 2.0. With it comes the ability to more directly access even more capabilities of your UniFi Protect cameras, such as the camera status light which you can now modify from within the Home app.