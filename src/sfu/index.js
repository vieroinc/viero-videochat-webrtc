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

'use-strict'

import adapter from 'webrtc-adapter';

import { VieroError } from '@viero/common/error';
import { VieroWebRTCSignalingCommon } from '@viero/webrtc-signaling-common';
import { VieroWebRTCSignalingClient } from '@viero/webrtc-signaling-client';
import { VieroWebRTCCommon } from '@viero/webrtc-common';


const _defaultPeerConnectionConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

// DONE
const _onConnectionStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: !!peer ? 'in' : 'out',
      id: !!peer ? peer.socketId : self._.signaling._socket.id,
      state: 'connectionState',
      value: !!peer ? peer.ipc.connectionState : self._.opc.connectionState,
    }
  }));
  if (!peer) {
    return
  }
  if ('disconnected' === peer.ipc.connectionState) {
    debugger;
    /*
    if (participant.stream) {
      participant.stream.getTracks().forEach((track) => track.stop());
      participant.stream = null;
    }
    if (participant.outPeerConnection) {
      participant.outPeerConnection.close();
      participant.outPeerConnection = null;
    }
    if (participant.inPeerConnection) {
      participant.inPeerConnection.close();
      participant.inPeerConnection = null;
    }
    const stripped = self.participant(participant.id);
    delete self._.participants[participant.id];
    self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.PEER.DID_LEAVE, { detail: { participant: stripped } }));
    */
  }
};

// DONE
const _onICECandidate = (self, peer, evt) => {
  // !!peer ? in stream : out stream
  if (evt.candidate) {
    self._.signaling.send({
      word: VieroWebRTCCommon.WORD.CDT,
      data: JSON.parse(JSON.stringify(evt.candidate)),
      ...(!!peer ? { on: peer.socketId } : {}),
    });
  }
};

// DONE
const _onICEConnectionStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: !!peer ? 'in' : 'out',
      id: !!peer ? peer.socketId : self._.signaling._socket.id,
      state: 'iceConnectionState',
      value: !!peer ? peer.ipc.iceConnectionState : self._.opc.iceConnectionState,
    }
  }));
};

// DONE
const _onICEGatheringStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: !!peer ? 'in' : 'out',
      id: !!peer ? peer.socketId : self._.signaling._socket.id,
      state: 'iceGatheringState',
      value: !!peer ? peer.ipc.iceGatheringState : self._.opc.iceGatheringState,
    }
  }));
};

// DONE
const _onNegotiationNeeded = (self, peer, evt) => {
  const pc = peer ? peer.ipc : self._.opc;
  pc.createOffer()
    .then((offer) => {
      return pc.setLocalDescription(offer)
    })
    .then(() => {
      return self._.signaling.send({
        word: VieroWebRTCCommon.WORD.SDP,
        data: JSON.parse(JSON.stringify(pc.localDescription)),
      });
    })
    .catch((err) => {
      const error = new VieroError('/webrtc/sfu/client', 884761, { [VieroError.KEY.ERROR]: err });
      self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
    });
};

// DONE
const _onSignalingStateChange = (self, peer, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: !!peer ? 'in' : 'out',
      id: !!peer ? peer.socketId : self._.signaling._socket.id,
      state: 'signalingState',
      value: !!peer ? peer.ipc.signalingState : self._.opc.signalingState,
    }
  }));
};

// DONE
const _onTrack = (self, peer, evt) => {
  if (evt.streams && evt.streams.length) {
    peer.stream = evt.streams[0];
    peer = self.peer(peer.socketId);
    peer.stream.addEventListener('removetrack', (evt) => {
      setTimeout(() => {
        self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.TRACK.DID_REMOVE, { detail: { peer } }));
      }, 0);
    });
    self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.TRACK.DID_ADD, { detail: { peer } }));
  }
};

// DONE
const _addPeer = (self, socketId) => {
  const ipc = new RTCPeerConnection(self._._peerConnectionConfiguration);
  const peer = { socketId, ipc };

  ipc.addEventListener('connectionstatechange', _onConnectionStateChange.bind(null, self, peer));
  ipc.addEventListener('icecandidate', _onICECandidate.bind(null, self, peer));
  ipc.addEventListener('iceconnectionstatechange', _onICEConnectionStateChange.bind(null, self, peer));
  ipc.addEventListener('icegatheringstatechange', _onICEGatheringStateChange.bind(null, self, peer));
  ipc.addEventListener('signalingstatechange', _onSignalingStateChange.bind(null, self, peer));
  ipc.addEventListener('track', _onTrack.bind(null, self, peer));

  self._._peers[socketId] = peer;
  self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.PEER.DID_ENTER, { detail: { peer: self.peer(socketId) } }));
  return peer;
};

// DONE
const _onEnter = (self, evt) => {
  _addPeer(self, evt.detail.socketId);
}

// DONE
const _onMessage = (self, evt) => {
  const payload = evt.detail.payload;
  switch (payload.word) {
    case VieroWebRTCCommon.WORD.HELLO: {
      return payload.data.forEach((socketId) => {
        _addPeer(self, socketId);
      });
    }
    case VieroWebRTCCommon.WORD.SDP: {
      const sdp = new RTCSessionDescription(payload.data);
      const peer = self._._peers[payload.on];
      switch (sdp.type) {
        case 'offer': {
          // DONE
          // received an offer, answer it
          const ipc = peer.ipc;
          return ipc.setRemoteDescription(sdp)
            .then(() => {
              return ipc.createAnswer();
            })
            .then((answer) => {
              return ipc.setLocalDescription(answer);
            })
            .then(() => {
              return self._.signaling.send({
                word: VieroWebRTCCommon.WORD.SDP,
                on: payload.on,
                data: JSON.parse(JSON.stringify(ipc.localDescription)),
              });
            }).catch((err) => {
              const error = new VieroError('/webrtc/sfu/client', 352177, { [VieroError.KEY.ERROR]: err });
              self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
            });
        }
        case 'answer': {
          // DONE
          // received an answer
          return self._.opc.setRemoteDescription(sdp)
            .catch((err) => {
              const error = new VieroError('/webrtc/sfu/client', 645167, { [VieroError.KEY.ERROR]: err });
              self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
            });
        }
        default: return;
      }
    }
    case VieroWebRTCCommon.WORD.CDT: {
      const cdt = new RTCIceCandidate(payload.data);
      return (payload.on ? self._._peers[payload.on].ipc : self._.opc).addIceCandidate(cdt)
        .then(() => console.log('ICE CANDIDATE ADDED'))
        .catch((err) => {
          console.log('FAILED TO ADD ICE CANDIDATE');
          const error = new VieroError('/webrtc/sfu/client', 518450, { [VieroError.KEY.ERROR]: err, data: payload.data });
          self.dispatchEvent(new CustomEvent(VieroWebRTCCommon.EVENT.ERROR, { detail: { error } }));
        });
    }
  }
};


const _onLeave = (self, evt) => {
  debugger;
}

export class VieroWebRTCSFUClient extends EventTarget {

  constructor(peerConnectionConfiguration) {
    super();

    this._ = {
      _peerConnectionConfiguration: peerConnectionConfiguration || _defaultPeerConnectionConfiguration,
      _onEnterProxy: _onEnter.bind(null, this),
      _onMessageProxy: _onMessage.bind(null, this),
      _onLeaveProxy: _onLeave.bind(null, this),
      _peers: [],
      stream: new MediaStream([]),
    };
  }

  // DONE
  peer(socketId) {
    if (this._._peers[socketId]) {
      return { socketId, stream: this._._peers[socketId].stream || null };
    }
    return null;
  }

  // DONE
  peers() {
    return Object.values(this._._peers).map((peer) => ({ id: peer.id, stream: peer.stream }));
  }

  // DONE
  join(url, channel) {
    this.leave();
    const signaling = new VieroWebRTCSignalingClient(url, channel);
    return signaling.connect().then(() => {
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.ENTER, this._._onEnterProxy);
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, this._._onMessageProxy);
      signaling.addEventListener(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, this._._onLeaveProxy);
      const opc = new RTCPeerConnection(this._._peerConnectionConfiguration);
      opc.addEventListener('connectionstatechange', _onConnectionStateChange.bind(null, this, null));
      opc.addEventListener('icecandidate', _onICECandidate.bind(null, this, null));
      opc.addEventListener('iceconnectionstatechange', _onICEConnectionStateChange.bind(null, this, null));
      opc.addEventListener('icegatheringstatechange', _onICEGatheringStateChange.bind(null, this, null));
      opc.addEventListener('signalingstatechange', _onSignalingStateChange.bind(null, this, null));
      this._.signaling = signaling;
      this._.opc = opc;
    });
  }

  // DONE
  leave() {
    if (this._.signaling) {
      this._.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.ENTER, this._._onEnterProxy);
      this._.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, this._._onMessageProxy);
      this._.signaling.removeEventListener(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, this._._onLeaveProxy);
      delete this._.signaling;
    }
    if (this._.opc) {
      this._.opc.close();
      delete this._.opc;
    }
    Object.values(this._._peers).forEach((peer) => {
      if (peer.stream) {
        peer.stream.getTracks().forEach((t) => t.stop());
      }
      peer.ipc.close();
      delete this._._peers[peer.socketId];
    });
  }

  // DONE
  setStreams(streams = []) {
    // 1. collect all tracks
    const tracks = streams.reduce((acc, stream) => {
      acc.push(...stream.getTracks());
      return acc;
    }, []);

    // 2. save existing stream as previous
    const previous = this._.stream;

    // 3. set new stream
    this._.stream = new MediaStream(tracks);

    // 4. remove tracks from opc
    if (this._.opc) {
      const senders = this._.opc.getSenders();
      if (senders.length) {
        senders.forEach((sender) => this._.opc.removeTrack(sender));
      }

      // 5. add tracks to output stream
      this._.stream.getTracks().forEach((track) => this._.opc.addTrack(track, this._.stream));
      _onNegotiationNeeded(this);
    }

    // 6. remove tracks from previous
    if (previous) {
      Array.from(previous.getTracks()).forEach((t) => {
        t.stop();
        previous.removeTrack(t);
      });
    }
    return this._.stream;
  }

  // DONE
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

  // DONE
  static canCreateUserStream() {
    return !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
  }

  // DONE
  static createUserStream(configuration) {
    return navigator.mediaDevices.getUserMedia(configuration);
  }

  // DONE
  static canCreateDisplayStream() {
    return !!navigator.mediaDevices && !!navigator.mediaDevices.getDisplayMedia;
  }

  // DONE
  static createDisplayStream(configuration) {
    return navigator.mediaDevices.getDisplayMedia(configuration);
  }
}
