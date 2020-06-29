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

import { VieroWebRTCVideoChatSignaling } from "./signaling";
import { VieroError } from '@viero/common/error';

const _defaultPeerConnectionConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

const _onConnectionStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'connectionState',
      value: pc.connectionState,
    }
  }));
  if ('disconnected' === pc.connectionState) {
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
    delete self._._participants[participant.id];
    self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
  }
};

const _onICECandidate = (self, participant, pc, evt) => {
  if (evt.candidate) {
    self._._signaling.send({
      word: 'cdt',
      to: participant.id,
      from: self._._id,
      data: JSON.parse(JSON.stringify(evt.candidate)),
    });
  }
};

const _onICEConnectionStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'iceConnectionState',
      value: pc.iceConnectionState,
    }
  }));
};

const _onICEGatheringStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'iceGatheringState',
      value: pc.iceGatheringState,
    }
  }));
};

const _onNegotiationNeeded = (self, participant, pc, evt) => {
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      return self._._signaling.send({
        word: 'sdp',
        to: participant.id,
        from: self._._id,
        data: JSON.parse(JSON.stringify(pc.localDescription)),
      });
    })
    .catch((err) => {
      const error = new VieroError('VieroWebRTCVideoChat', 884761, err);
      self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
    });
};

const _onSignalingStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'signalingState',
      value: pc.signalingState,
    }
  }));
};

const _onTrack = (self, participant, pc, evt) => {
  if (evt.streams && evt.streams.length) {
    participant.stream = evt.streams[0];
    participant.stream.addEventListener('removetrack', (evt) => {
      setTimeout(() => {
        self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
      }, 0);
    });
    self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
  }
};

const _participant = (self, id) => {
  return self._._participants[id];
}

const _addParticipant = (self, id) => {
  if (self._._participants[id]) {
    return self._._participants[id];
  }
  const opc = new RTCPeerConnection(self._._peerConnectionConfiguration);
  const ipc = new RTCPeerConnection(self._._peerConnectionConfiguration);
  const participant = { id, outPeerConnection: opc, inPeerConnection: ipc };

  [opc, ipc].forEach((pc) => {
    pc.addEventListener('connectionstatechange', _onConnectionStateChange.bind(null, self, participant, pc));
    pc.addEventListener('icecandidate', _onICECandidate.bind(null, self, participant, pc));
    pc.addEventListener('iceconnectionstatechange', _onICEConnectionStateChange.bind(null, self, participant, pc));
    pc.addEventListener('icegatheringstatechange', _onICEGatheringStateChange.bind(null, self, participant, pc));
    pc.addEventListener('signalingstatechange', _onSignalingStateChange.bind(null, self, participant, pc));
  });
  [ipc].forEach((pc) => {
    pc.addEventListener('track', _onTrack.bind(null, self, participant, pc));
  });
  self._._participants[id] = participant;
  return participant;
};

const _addStreamToParticipant = (self, participant) => {
  const opc = participant.outPeerConnection;
  const senders = opc.getSenders();
  if (senders.length) {
    senders.forEach((sender) => opc.removeTrack(sender));
  }
  self._._stream.getTracks().forEach((track) => {
    opc.addTrack(track, self._._stream);
  });
  _onNegotiationNeeded(self, participant, participant.outPeerConnection);
};

const _onSignal = (self, evt) => {
  if (
    (evt.detail.to && evt.detail.to !== self._._id)
    || (evt.detail.from && evt.detail.from === self._._id)
  ) {
    return;
  }

  switch (evt.detail.word) {
    case 'hello': {
      const participant = _addParticipant(self, evt.detail.from);
      return _addStreamToParticipant(self, participant);
    }
    case 'sdp': {
      const sdp = new RTCSessionDescription(evt.detail.data);
      let participant = _participant(self, evt.detail.from);
      if (!participant) {
        participant = _addParticipant(self, evt.detail.from);
        _addStreamToParticipant(self, participant);
      }
      switch (sdp.type) {
        case 'offer': {
          // received an offer, answer it
          const ipc = participant.inPeerConnection;
          return ipc.setRemoteDescription(sdp).then(() => {
            return ipc.createAnswer()
              .then((answer) => ipc.setLocalDescription(answer))
              .then(() => self._._signaling.send({
                word: 'sdp',
                to: participant.id,
                from: self._._id,
                data: JSON.parse(JSON.stringify(ipc.localDescription)),
              }));
          }).catch((err) => {
            const error = new VieroError('VieroWebRTCVideoChat', 352177, err);
            self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
          });
        }
        case 'answer': {
          // received an answer
          return participant.outPeerConnection.setRemoteDescription(sdp).catch((err) => {
            const error = new VieroError('VieroWebRTCVideoChat', 645167, err);
            self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
          });
        }
        default: return;
      }
    }
    case 'cdt': {
      const cdt = new RTCIceCandidate(evt.detail.data);
      const participant = _participant(self, evt.detail.from);
      return participant.outPeerConnection.addIceCandidate(cdt).catch((err) => {
        const error = new VieroError('VieroWebRTCVideoChat', 518450, err);
        self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
      })

    }
  }
};

export class VieroWebRTCVideoChat extends EventTarget {

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

  constructor(id, peerConnectionConfiguration) {
    super();

    if (!id || !/^[a-zA-Z0-9-_.@#=]{1,}$/.test(id)) {
      return Promise.reject(new VieroError('VieroWebRTCVideoChat', 596850));
    }

    this._ = {
      _id: id,
      _peerConnectionConfiguration: peerConnectionConfiguration || _defaultPeerConnectionConfiguration,
      _participants: [],
      _onSignalProxy: _onSignal.bind(null, this),
      _stream: new MediaStream([]),
    };
  }

  get participants() {
    return Object.values(this._._participants)
      .map((p) => ({ id: p.id, stream: p.stream }));
  }

  setSignaling(signaling) {
    return new Promise((resolve) => {
      if (this._._signaling) {
        this._._signaling.removeEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, this._._onSignalProxy);
        Object.values(this._._participants).forEach((participant) => {
          if (participant.stream) {
            participant.stream.getTracks().forEach((t) => t.stop());
          }
          participant.outPeerConnection.close();
          participant.inPeerConnection.close();
          delete this._._participants[participant.id];
        });
        self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
      }
      this._._signaling = signaling;
      if (this._._signaling) {
        this._._signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, this._._onSignalProxy);
        this._._signaling.send({ word: 'hello', from: this._._id });
      }
      resolve();
    });
  }

  setStreams(streams = []) {
    const tracks = streams.reduce((acc, stream) => {
      acc.push(...stream.getTracks());
      return acc;
    }, []);
    const previous = this._._stream;
    this._._stream = new MediaStream(tracks);
    Object.values(this._._participants).forEach((participant) => _addStreamToParticipant(this, participant));
    if (previous) {
      Array.from(previous.getTracks()).forEach((t) => {
        t.stop();
        previous.removeTrack(t);
      });
    }
    return this._._stream;
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

VieroWebRTCVideoChat.EVENT = {
  PARTICIPANTS_DID_CHANGE: 'VieroWebRTCVideoChatEventParticipantsDidChange',
  WEBRTC_STATE_DID_CHANGE: 'VieroWebRTCVideoChatEventWebRTCStateDidChange',
  ERROR: 'VieroWebRTCVideoChatEventError',
};
