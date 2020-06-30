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

import { VieroUID as uid } from '@viero/common/uid';
import { VieroWebDocumentUtils as wdu } from '@viero/common/web/document/utils';

import { VieroWebRTCVideoChat } from "../../..";
import { VieroWebRTCVideoChatSocketIoSignaling } from "../signaling.socketio";

const urlObj = new URL(location.href);
const channel = urlObj.searchParams.get('channel');
if (!channel) {
  urlObj.searchParams.set('channel', uid.short());
  location.href = urlObj.toString();
}

const state = window.vierochat = {};
const me = document.querySelector('#me');
const participants = document.querySelector('#participants');
const chatJoinButton = document.querySelector('#chat-join-button');
const chatLeaveButton = document.querySelector('#chat-leave-button');

chatJoinButton.addEventListener('click', () => {
  if (!VieroWebRTCVideoChat.canCreateUserStream()) {
    return alert('Your browser is missing the required technology for WebRTC!');
  }
  chatJoinButton.setAttribute('disabled', '');
  chatLeaveButton.removeAttribute('disabled');
  state.signaling = new VieroWebRTCVideoChatSocketIoSignaling(channel);
  return state.signaling.connect().then(() => {
    state.videochat.setSignaling(state.signaling);
    VieroWebRTCVideoChat.createUserStream({ video: true, audio: true })
      .then((stream) => state.videochat.setStreams([stream]))
      .then((stream) => wdu.createElement('video', { attributes: { playsinline: '', autoplay: '' }, properties: { srcObject: stream, muted: true }, container: me }));
  });
});

chatLeaveButton.addEventListener('click', () => {
  chatJoinButton.removeAttribute('disabled');
  chatLeaveButton.setAttribute('disabled', '');
  if (state.signaling) {
    state.signaling.disconnect();
  }
});

state.id = uid.short();
state.videochat = new VieroWebRTCVideoChat(state.id);
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.WEBRTC.STATE_DID_CHANGE, (evt) => {
  console.log(`SIMPLE - EVT: WEBRTC(${evt.detail.direction}).STATE_DID_CHANGE`, evt.detail.state, 'CHANGED TO', evt.detail.value, 'ON', evt.detail.id)
});
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_ADD, (evt) => {
  console.log('SIMPLE - EVT: PARTICIPANT.DID_ADD', evt.detail.participant.id);
  wdu.createElement('video', { attributes: { id: `participant-${evt.detail.participant.id}`, playsinline: '', autoplay: '' }, container: participants });
});
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_REMOVE, (evt) => {
  console.log('SIMPLE - EVT: PARTICIPANT.DID_REMOVE', evt.detail.participant.id);
  document.querySelector(`#participant-${evt.detail.participant.id}`).remove();
});
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.PARTICIPANT.DID_REMOVE_ALL, (evt) => {
  console.log('SIMPLE - EVT: PARTICIPANT.DID_REMOVE_ALL');
  participants.innerHTML = '';
});
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.TRACK.DID_ADD, (evt) => {
  console.log('SIMPLE - EVT: TRACK.DID_ADD', evt.detail.participant.id);
  document.querySelector(`#participant-${evt.detail.participant.id}`).srcObject = evt.detail.participant.stream;
});
state.videochat.addEventListener(VieroWebRTCVideoChat.EVENT.TRACK.DID_REMOVE, (evt) => {
  console.log('SIMPLE - EVT: TRACK.DID_REMOVE', evt.detail.participant.id);
  document.querySelector(`#participant-${evt.detail.participant.id}`).srcObject = evt.detail.participant.stream;
});
