# @viero/webrtc-sfu-client

WebRTC SFU client library by @vieroinc.

To see how viero's webrtc-sfu works either visit http://client.vcdemo.viero.tv or clone the example code from [viero-webrtc-sfu-example](https://github.com/vieroinc/viero-webrtc-sfu-example) on GitHub locally.

## How to

### Install

```bash
npm install --save @viero/webrtc-signaling-client
npm install --save @viero/webrtc-sfu-client
```

### Use

```js
import { VieroWebRTCSignalingClient } from "@viero/webrtc-signaling-client";
import { VieroWebRTCSFUClient } from "@viero/webrtc-sfu-client";

const signaling = new VieroWebRTCSignalingClient(
  "http://localhost:8090",
  "some-channel"
);
const videochat = new VieroWebRTCSFUClient();

videochat
  .join(state.signaling)
  .then(() =>
    VieroWebRTCSFUClient.createUserStream({ video: true, audio: true })
  )
  .then((stream) => state.videochat.setStreams([stream]))
  .then((stream) => {
    /* do something with the stream, eg:
    VieroWindowUtils.createElement('video', {
      attributes: { playsinline:  '', autoplay:  '' },
      properties: { srcObject:  stream, muted:  true },
      container:  me,
    });
    */
  });
```
