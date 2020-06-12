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

const _defaultStreamConfiguration = {
  media: {
    audio: true,
    video: true,
  },
  source: 'camera',
}

let _sharedInstance;
let _peerConnectionConfiguration;
let _streamConfiguration;

let _id;
let _signaling;

const _participants = [];
let _state;

const _onConnectionStateChange = (participant, evt) => {
  VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'connectionState',
      value: participant.peerConnection.connectionState,
    }
  }));
  if ('disconnected' === participant.peerConnection.connectionState) {
    const idx = _participants.findIndex((p) => p.id === participant.id);
    const deleted = _participants.splice(idx, 1)[0];
    if (deleted.stream) {
      deleted.stream.getTracks().forEach((track) => track.stop());
    }
    if (deleted.peerConnection) {
      deleted.peerConnection.close();
    }
    VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
  }
};
const _onICECandidate = (participant, evt) => {
  if (evt.candidate) {
    _signaling.send({
      word: 'cdt',
      to: participant.id,
      from: _id,
      data: JSON.parse(JSON.stringify(evt.candidate)),
    });
  }
};
const _onICEConnectionStateChange = (participant, evt) => {
  VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'iceConnectionState',
      value: participant.peerConnection.iceConnectionState,
    }
  }));
};
const _onICEGatheringStateChange = (participant, evt) => {
  VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'iceGatheringState',
      value: participant.peerConnection.iceGatheringState,
    }
  }));
};
const _onNegotiationNeeded = (participant, evt) => {
  const pc = participant.peerConnection;
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      return _signaling.send({
        word: 'sdp',
        to: participant.id,
        from: _id,
        data: JSON.parse(JSON.stringify(pc.localDescription)),
      });
    })
    .catch((err) => {
      const error = new VieroError('VieroWebRTCVideoChat', 884761, err);
      VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
    });
};
const _onSignalingStateChange = (participant, evt) => {
  VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE, {
    detail: {
      id: participant.id,
      state: 'signalingState',
      value: participant.peerConnection.signalingState,
    }
  }));
};
const _onTrack = (participant, evt) => {
  if (evt.streams && evt.streams.length) {
    participant.stream = evt.streams[0];
    VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
  }
};

const _onSignal = (evt) => {

  if (_state !== VieroWebRTCVideoChat.STATE.JOINED) {
    return;
  }

  if (evt.detail.to && evt.detail.to !== _id) {
    return;
  }

  switch (evt.detail.word) {
    case 'hello': {
      if (_me().id === evt.detail.from) {
        return;
      }
      return _addParticipant(evt.detail.from);
    }
    case 'sdp': {
      const sdp = new RTCSessionDescription(evt.detail.data);
      let participant = _participant(evt.detail.from);
      if (!participant) {
        participant = _addParticipant(evt.detail.from, true);
      }
      const pc = participant.peerConnection;
      return pc.setRemoteDescription(sdp).then(() => {
        if ('offer' !== sdp.type) return;
        const stream = VieroWebRTCVideoChat.sharedInstance.localStream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        return pc.createAnswer()
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => _signaling.send({
            word: 'sdp',
            to: participant.id,
            from: _id,
            data: JSON.parse(JSON.stringify(pc.localDescription)),
          }));
      }).catch((err) => {
        const error = new VieroError('VieroWebRTCVideoChat', 352177, err);
        VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
      });
    }
    case 'cdt': {
      const cdt = new RTCIceCandidate(evt.detail.data);
      const participant = _participant(evt.detail.from);
      return participant.peerConnection.addIceCandidate(cdt).catch((err) => {
        const error = new VieroError('VieroWebRTCVideoChat', 518450, err);
        VieroWebRTCVideoChat.sharedInstance.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.ERROR, { detail: { error } }));
      });
    }
  }
};

const _ensureLocalStream = () => {
  const op = 'screen' === _streamConfiguration.source ? 'getDisplayMedia' : 'getUserMedia';
  return navigator.mediaDevices[op](_streamConfiguration.media);
};

const _participant = (id) => {
  return _participants.find((p) => p.id === id);
};

const _me = () => {
  return _participant(_id);
};

const _addParticipant = (id, dry) => {
  const pc = new RTCPeerConnection(_peerConnectionConfiguration);
  const participant = { id, peerConnection: pc };
  _participants.push(participant);
  pc.addEventListener('connectionstatechange', _onConnectionStateChange.bind(this, participant));
  pc.addEventListener('icecandidate', _onICECandidate.bind(this, participant));
  pc.addEventListener('iceconnectionstatechange', _onICEConnectionStateChange.bind(this, participant));
  pc.addEventListener('icegatheringstatechange', _onICEGatheringStateChange.bind(this, participant));
  pc.addEventListener('negotiationneeded', _onNegotiationNeeded.bind(this, participant));
  pc.addEventListener('signalingstatechange', _onSignalingStateChange.bind(this, participant));
  pc.addEventListener('track', _onTrack.bind(this, participant));
  if (!dry) {
    const stream = VieroWebRTCVideoChat.sharedInstance.localStream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  }
  return participant;
};

export class VieroWebRTCVideoChat extends EventTarget {

  static get sharedInstance() {
    if (!_sharedInstance) {
      _sharedInstance = new VieroWebRTCVideoChat();
    }
    return _sharedInstance;
  }

  get state() {
    return _state;
  }

  get participants() {
    return _participants.map((p) => ({ id: p.id, stream: p.stream }));
  }

  get localStream() {
    return (_me() || {}).stream;
  }

  configure(configuration) {
    configuration = configuration || {};
    _peerConnectionConfiguration = configuration.peerConnectionConfiguration || _defaultPeerConnectionConfiguration;
    _streamConfiguration = configuration.streamConfiguration || _defaultStreamConfiguration;
  }

  prepare(signaling, id) {
    if (VieroWebRTCVideoChat.STATE.UNPREPARED !== _state) {
      this.hangup();
    }

    if (!id || !/^[a-zA-Z0-9-_.@#=]{1,}$/.test(id)) {
      return Promise.reject(new VieroError('VieroWebRTCVideoChat', 596850));
    }

    _id = id;

    _signaling = signaling;
    _signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, _onSignal.bind(this));
    _signaling.connect();

    return _ensureLocalStream().then((stream) => {
      _participants.push({ id, stream });
      _state = VieroWebRTCVideoChat.STATE.PREPARED;
      this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
      this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.STATE_DID_CHANGE, { detail: { state: _state } }));
    }).catch((err) => {
      this.hangup();
      return Promise.reject(new VieroError('VieroWebRTCVideoChat', 463108, err));
    });
  }

  join() {
    if (!this.localStream) {
      return Promise.reject(new VieroError('VieroWebRTCVideoChat', 838369));
    }
    _state = VieroWebRTCVideoChat.STATE.JOINED;
    _signaling.send({ word: 'hello', from: _id });
    this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.STATE_DID_CHANGE, { detail: { state: _state } }));
    return Promise.resolve();
  }

  hangup() {
    _state = VieroWebRTCVideoChat.STATE.UNPREPARED;
    if (_signaling) {
      _signaling.disconnect();
      _signaling = void 0;
    }
    _id = void 0;
    if (_participants.length) {
      _participants.forEach((p) => {
        if (p.stream) {
          p.stream.getTracks().forEach((track) => track.stop());
        }
        if (p.peerConnection) {
          p.peerConnection.close();
        }
      });
      _participants.length = 0;
      this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE));
    }
    this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChat.EVENT.STATE_DID_CHANGE, { detail: { state: _state } }));
  }
}

VieroWebRTCVideoChat.EVENT = {
  STATE_DID_CHANGE: 'VieroWebRTCVideoChatEventStateDidChange',
  PARTICIPANTS_DID_CHANGE: 'VieroWebRTCVideoChatEventParticipantsDidChange',
  WEBRTC_STATE_DID_CHANGE: 'VieroWebRTCVideoChatEventWebRTCStateDidChange',
  ERROR: 'VieroWebRTCVideoChatEventError',
};

VieroWebRTCVideoChat.STATE = {
  UNPREPARED: 'VieroWebRTCVideoChatStateUnprepared',
  PREPARED: 'VieroWebRTCVideoChatStatePrepared',
  JOINED: 'VieroWebRTCVideoChatStateJoined',
};

_state = VieroWebRTCVideoChat.STATE.UNPREPARED;
