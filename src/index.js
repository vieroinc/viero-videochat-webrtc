/**
 * Copyright 2020 Viero, Inc.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

'use-strict';

// eslint-disable-next-line no-unused-vars
import adapter from 'webrtc-adapter';
import { EventTarget } from 'event-target-shim';

import { VieroError } from '@viero/common/error';
import { VieroWebRTCSignalingCommon } from '@viero/webrtc-signaling-common';
import { VieroWebRTCCommon } from '@viero/webrtc-common';

const DEFAULT_PEERCONNECTION_CONFIGURATION = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

const mySocketId = (self) => {
  // eslint-disable-next-line no-underscore-dangle
  if (self.$.signaling && self.$.signaling._socket && self.$.signaling._socket.id) {
    // eslint-disable-next-line no-underscore-dangle
    return self.$.signaling._socket.id;
  }
  return null;
};

const onConnectionStateChange = (self, peer, evt) => {
  const value = evt.currentTarget.connectionState;
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: peer ? 'in' : 'out',
      id: peer ? peer.socketId : mySocketId(self),
      state: 'connectionState',
      value,
    },
  }));
  if (value === 'disconnected') {
    if (peer) {
      // the peer's ipc disconnected
      // 1. we need to check whether signaling is still on
      // 2. if not, we must leave
      // 3. if it is, we need to ask the server to renegotiate
    } else {
      // our opc is disconnected
      // 1. we need to check whether signaling is still on
      // 2. if not, we must leave
      // 3. if it is, we need to renegotiate
    }
  } else if (value === 'failed') {
    // not sure how to handle this
  }
};

const onICECandidate = (self, peer, evt) => {
  if (evt.candidate) {
    self.$.signaling.send({
      word: VieroWebRTCCommon.WORD.CDT,
      data: JSON.parse(JSON.stringify(evt.candidate)),
      ...(peer ? { on: peer.socketId } : {}),
    });
  }
};

const onICEConnectionStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: peer ? 'in' : 'out',
      id: peer ? peer.socketId : mySocketId(self),
      state: 'iceConnectionState',
      value: evt.currentTarget.iceConnectionState,
    },
  }));
};

const onICEGatheringStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: peer ? 'in' : 'out',
      id: peer ? peer.socketId : mySocketId(self),
      state: 'iceGatheringState',
      value: evt.currentTarget.iceGatheringState,
    },
  }));
};

const onNegotiationNeeded = (self, peer) => {
  const pc = peer ? peer.ipc : self.$.opc;
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => self.$.signaling.send({
      word: VieroWebRTCCommon.WORD.SDP,
      data: JSON.parse(JSON.stringify(pc.localDescription)),
    }))
    .catch((err) => {
      const error = new VieroError('/webrtc/sfu/client', 884761, { [VieroError.KEY.ERROR]: err });
      self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
    });
};

const onSignalingStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: peer ? 'in' : 'out',
      id: peer ? peer.socketId : mySocketId(self),
      state: 'signalingState',
      value: evt.currentTarget.signalingState,
    },
  }));
};

const onTrack = (self, peer, evt) => {
  if (evt.streams && evt.streams.length) {
    // eslint-disable-next-line prefer-destructuring
    peer.stream = evt.streams[0];
    peer.stream.addEventListener('removetrack', () => {
      setTimeout(() => {
        self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.TRACK.DID_REMOVE, { detail: { peer } }));
      }, 0);
    });
    self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.TRACK.DID_ADD, { detail: { peer } }));
  }
};

const stripPeer = (peer) => ({ socketId: peer.socketId, stream: peer.stream || new MediaStream([]) });

const addPeer = (self, socketId) => {
  const ipc = new RTCPeerConnection(self.$.peerConnectionConfiguration);
  const peer = { socketId, ipc, stream: new MediaStream([]) };

  ipc.addEventListener('connectionstatechange', onConnectionStateChange.bind(null, self, peer));
  ipc.addEventListener('icecandidate', onICECandidate.bind(null, self, peer));
  ipc.addEventListener('iceconnectionstatechange', onICEConnectionStateChange.bind(null, self, peer));
  ipc.addEventListener('icegatheringstatechange', onICEGatheringStateChange.bind(null, self, peer));
  ipc.addEventListener('signalingstatechange', onSignalingStateChange.bind(null, self, peer));
  ipc.addEventListener('track', onTrack.bind(null, self, peer));

  self.$.peers[socketId] = peer;
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.PEER.DID_ENTER, { detail: { peer: stripPeer(peer) } }));
  return peer;
};

const removePeer = (self, peer) => {
  peer.ipc.close();
  delete self.$.peers[peer.socketId];
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.PEER.DID_LEAVE, { detail: { peer: stripPeer(peer) } }));
};

const onEnter = (self, evt) => {
  addPeer(self, evt.detail.socketId);
};

const onLeave = (self, evt) => {
  const peer = self.$.peers[evt.detail.socketId];
  if (!peer) return;
  removePeer(self, peer);
};

const onMessage = (self, evt) => {
  const { payload } = evt.detail;
  switch (payload.word) {
    case VieroWebRTCCommon.WORD.HELLO: {
      return payload.data.forEach((socketId) => {
        addPeer(self, socketId);
      });
    }
    case VieroWebRTCCommon.WORD.SDP: {
      const sdp = new RTCSessionDescription(payload.data);
      const peer = self.$.peers[payload.on];
      switch (sdp.type) {
        case 'offer': {
          // DONE
          // received an offer, answer it
          const { ipc } = peer;
          return ipc.setRemoteDescription(sdp)
            .then(() => ipc.createAnswer())
            .then((answer) => ipc.setLocalDescription(answer))
            .then(() => self.$.signaling.send({
              word: VieroWebRTCCommon.WORD.SDP,
              on: payload.on,
              data: JSON.parse(JSON.stringify(ipc.localDescription)),
            }))
            .catch((err) => {
              const error = new VieroError('/webrtc/sfu/client', 352177, { [VieroError.KEY.ERROR]: err });
              self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
            });
        }
        case 'answer': {
          // DONE
          // received an answer
          return self.$.opc.setRemoteDescription(sdp)
            .catch((err) => {
              const error = new VieroError('/webrtc/sfu/client', 645167, { [VieroError.KEY.ERROR]: err });
              self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
            });
        }
        default: {
          return Promise.resolve();
        }
      }
    }
    case VieroWebRTCCommon.WORD.CDT: {
      const cdt = new RTCIceCandidate(payload.data);
      return (payload.on ? self.$.peers[payload.on].ipc : self.$.opc).addIceCandidate(cdt)
        .catch((err) => {
          const error = new VieroError('/webrtc/sfu/client', 518450, {
            [VieroError.KEY.ERROR]: err, data: payload.data,
          });
          self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
        });
    }
    default: {
      return Promise.resolve();
    }
  }
};

export class VieroWebRTCSFUClient extends EventTarget {
  constructor(peerConnectionConfiguration) {
    super();

    this.$ = {
      peerConnectionConfiguration: peerConnectionConfiguration || DEFAULT_PEERCONNECTION_CONFIGURATION,
      onEnterProxy: onEnter.bind(null, this),
      onMessageProxy: onMessage.bind(null, this),
      onLeaveProxy: onLeave.bind(null, this),
      peers: [],
      stream: new MediaStream([]),
    };
  }

  peer(socketId) {
    const peer = this.$.peers[socketId];
    if (peer) {
      return stripPeer(peer);
    }
    return null;
  }

  peers() {
    return Object.values(this.$.peers).map((peer) => stripPeer(peer));
  }

  join(signaling) {
    this.leave();
    return signaling.connect().then(() => {
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.ENTER, this.$.onEnterProxy);
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, this.$.onMessageProxy);
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, this.$.onLeaveProxy);
      const opc = new RTCPeerConnection(this.$.peerConnectionConfiguration);
      opc.addEventListener('connectionstatechange', onConnectionStateChange.bind(null, this, null));
      opc.addEventListener('icecandidate', onICECandidate.bind(null, this, null));
      opc.addEventListener('iceconnectionstatechange', onICEConnectionStateChange.bind(null, this, null));
      opc.addEventListener('icegatheringstatechange', onICEGatheringStateChange.bind(null, this, null));
      opc.addEventListener('signalingstatechange', onSignalingStateChange.bind(null, this, null));
      this.$.signaling = signaling;
      this.$.opc = opc;
    });
  }

  leave() {
    if (this.$.signaling) {
      this.$.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.ENTER, this.$.onEnterProxy);
      this.$.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, this.$.onMessageProxy);
      this.$.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, this.$.onLeaveProxy);
      this.$.signaling.disconnect();
      delete this.$.signaling;
    }
    if (this.$.opc) {
      this.$.opc.close();
      delete this.$.opc;
    }
    Object.values(this.$.peers).forEach((peer) => {
      if (peer.stream) {
        peer.stream.getTracks().forEach((t) => t.stop());
      }
      peer.ipc.close();
      delete this.$.peers[peer.socketId];
    });
  }

  setStreams(streams = []) {
    // 1. collect all tracks
    const tracks = streams.reduce((acc, stream) => {
      acc.push(...stream.getTracks());
      return acc;
    }, []);

    // 2. save existing stream as previous
    const previous = this.$.stream;

    // 3. set new stream
    this.$.stream = new MediaStream(tracks);

    // 4. remove tracks from opc
    if (this.$.opc) {
      const senders = this.$.opc.getSenders();
      if (senders.length) {
        senders.forEach((sender) => this.$.opc.removeTrack(sender));
      }

      // 5. add tracks to output stream
      this.$.stream.getTracks().forEach((track) => this.$.opc.addTrack(track, this.$.stream));
      onNegotiationNeeded(this);
    }

    // 6. remove tracks from previous
    if (previous) {
      Array.from(previous.getTracks()).forEach((t) => {
        t.stop();
        previous.removeTrack(t);
      });
    }
    return this.$.stream;
  }

  static availableSources() {
    return navigator.mediaDevices.enumerateDevices()
      .then((devices) => devices.reduce((acc, device) => {
        acc[device.groupId] = acc[device.groupId] || {};
        acc[device.groupId][device.deviceId] = {
          kind: device.kind,
          label: device.label,
        };
        return acc;
      }, {}));
  }

  static canCreateUserStream() {
    return !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
  }

  static createUserStream(configuration) {
    return navigator.mediaDevices.getUserMedia(configuration);
  }

  static canCreateDisplayStream() {
    return !!navigator.mediaDevices && !!navigator.mediaDevices.getDisplayMedia;
  }

  static createDisplayStream(configuration) {
    return navigator.mediaDevices.getDisplayMedia(configuration);
  }
}
