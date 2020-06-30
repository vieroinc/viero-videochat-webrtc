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
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: pc === participant.outPeerConnection ? 'out' : 'in',
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
    const stripped = self.participant(participant.id);
    delete self._.participants[participant.id];
    self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_REMOVE, { detail: { participant: stripped } }));
  }
};

const _onICECandidate = (self, participant, pc, evt) => {
  if (evt.candidate) {
    self._.signaling.send({
      word: 'cdt',
      to: participant.id,
      from: self._.id,
      data: JSON.parse(JSON.stringify(evt.candidate)),
    });
  }
};

const _onICEConnectionStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: pc === participant.outPeerConnection ? 'out' : 'in',
      id: participant.id,
      state: 'iceConnectionState',
      value: pc.iceConnectionState,
    }
  }));
};

const _onICEGatheringStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: pc === participant.outPeerConnection ? 'out' : 'in',
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
      return self._.signaling.send({
        word: 'sdp',
        to: participant.id,
        from: self._.id,
        data: JSON.parse(JSON.stringify(pc.localDescription)),
      });
    })
    .catch((err) => {
      const error = new VieroError('VieroWebRTCVideoChat', 884761, err);
      self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
    });
};

const _onSignalingStateChange = (self, participant, pc, evt) => {
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC.STATE_DID_CHANGE, {
    detail: {
      direction: pc === participant.outPeerConnection ? 'out' : 'in',
      id: participant.id,
      state: 'signalingState',
      value: pc.signalingState,
    }
  }));
};

const _onTrack = (self, participant, pc, evt) => {
  if (evt.streams && evt.streams.length) {
    participant.stream = evt.streams[0];
    const stripped = self.participant(participant.id);
    participant.stream.addEventListener('removetrack', (evt) => {
      setTimeout(() => {
        self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.TRACK.DID_REMOVE, { detail: { participant: stripped } }));
      }, 0);
    });
    self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.TRACK.DID_ADD, { detail: { participant: stripped } }));
  }
};

const _addParticipant = (self, id) => {
  if (self._.participants[id]) {
    return self._.participants[id];
  }
  const opc = new RTCPeerConnection(self._.peerConnectionConfiguration);
  const ipc = new RTCPeerConnection(self._.peerConnectionConfiguration);
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
  self._.participants[id] = participant;
  const stripped = self.participant(id);
  self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_ADD, { detail: { participant: stripped } }));
  return participant;
};

const _addStreamToParticipant = (self, participant) => {
  const opc = participant.outPeerConnection;
  const senders = opc.getSenders();
  if (senders.length) {
    senders.forEach((sender) => opc.removeTrack(sender));
  }
  self._.stream.getTracks().forEach((track) => {
    opc.addTrack(track, self._.stream);
  });
  _onNegotiationNeeded(self, participant, opc);
};

const _onSignal = (self, evt) => {
  if (
    (evt.detail.to && evt.detail.to !== self._.id)
    || (evt.detail.from && evt.detail.from === self._.id)
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
      let participant = self._.participants[evt.detail.from];
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
              .then(() => self._.signaling.send({
                word: 'sdp',
                to: participant.id,
                from: self._.id,
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
      const participant = self._.participants[evt.detail.from];
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
      id: id,
      peerConnectionConfiguration: peerConnectionConfiguration || _defaultPeerConnectionConfiguration,
      participants: [],
      onSignalProxy: _onSignal.bind(null, this),
      stream: new MediaStream([]),
    };
  }

  participant(id) {
    return { id, stream: this._.participants[id].stream };
  }

  participants() {
    return Object.values(this._.participants)
      .map((p) => ({ id: p.id, stream: p.stream }));
  }

  setSignaling(signaling) {
    return new Promise((resolve) => {
      if (this._.signaling) {
        this._.signaling.removeEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, this._.onSignalProxy);
        Object.values(this._.participants).forEach((participant) => {
          if (participant.stream) {
            participant.stream.getTracks().forEach((t) => t.stop());
          }
          participant.outPeerConnection.close();
          participant.inPeerConnection.close();
          delete this._.participants[participant.id];
        });
        self.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_REMOVE_ALL));
      }
      this._.signaling = signaling;
      if (this._.signaling) {
        this._.signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, this._.onSignalProxy);
        this._.signaling.send({ word: 'hello', from: this._.id });
      }
      resolve();
    });
  }

  setStreams(streams = []) {
    const tracks = streams.reduce((acc, stream) => {
      acc.push(...stream.getTracks());
      return acc;
    }, []);
    const previous = this._.stream;
    this._.stream = new MediaStream(tracks);
    Object.values(this._.participants).forEach((participant) => _addStreamToParticipant(this, participant));
    if (previous) {
      Array.from(previous.getTracks()).forEach((t) => {
        t.stop();
        previous.removeTrack(t);
      });
    }
    return this._.stream;
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
  WEBRTC: {
    STATE_DID_CHANGE: 'VieroWebRTCVideoChatEventWebRTCStateDidChange',
  },
  PARTICIPANT: {
    DID_ADD: 'VieroWebRTCVideoChatEventParticipantDidAdd',
    DID_REMOVE: 'VieroWebRTCVideoChatEventParticipantDidRemove',
    DID_REMOVE_ALL: 'VieroWebRTCVideoChatEventParticipantDidRemoveAll',
  },
  TRACK: {
    DID_ADD: 'VieroWebRTCVideoChatEventTrackDidAdd',
    DID_REMOVE: 'VieroWebRTCVideoChatEventTrackDidRemove',
  },
  ERROR: 'VieroWebRTCVideoChatEventError',
};
