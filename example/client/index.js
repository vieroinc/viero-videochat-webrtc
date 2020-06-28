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

import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';
import { VieroUID } from '@viero/common/uid';

import { VieroWebRTCVideoChat } from "../..";
import { VieroWebRTCVideoChatSignaling } from "../../signaling";
import { VieroWebRTCVideoChatSocketIoSignaling } from "./signaling.socketio";

const urlObj = new URL(location.href);
const channel = urlObj.searchParams.get('channel');
if (!channel) {
  urlObj.searchParams.set('channel', VieroUID.short());
  location.href = urlObj.toString();
}

const state = {};
const cfg = [
  { user: true, audio: true }, // 0
  { user: true }, // 1
  { audio: true }, // 2
  { display: true, audio: true }, // 3
  { user: true, display: true, audio: true }, // 4
  {}, // 5
];

const join = () => {
  state.signaling = new VieroWebRTCVideoChatSocketIoSignaling(channel);
  return state.signaling.connect().then(() => {
    state.videochat.setSignaling(state.signaling);
    if (!state.currentStreamConfiguration) {
      state.videochat.setStreamConfiguration({});
    }
  });
};

const leave = () => {
  if (state.signaling) {
    state.signaling.disconnect();
    state.videochat.setSignaling().then(() => renderParticipants(state.videochat.participants, participants));
  }
};

const renderParticipants = (participants, container, muted) => {
  render(
    repeat(
      participants,
      (p) => p.id,
      (p) => {
        console.log(
          'Rendering',
          p.userStream.getTracks().map((t) => `${t.kind}:${t.contentHint}:${t.id}`),
          'in USER and',
          p.displayStream.getTracks().map((t) => `${t.kind}:${t.contentHint}:${t.id}`),
          'in DISPLAY',
        );
        return html`
          <div class="participant" id=${p.id}>
            <video class="user" playsinline autoplay .srcObject=${p.userStream} .muted=${!!muted}></video>
            <video class="display" playsinline autoplay .srcObject=${p.displayStream} .muted=${!!muted}></video>
          <div>
        `;
      },
    ),
    container,
  );
};

const stats = document.querySelector('#stats');
const me = document.querySelector('#me');
const participants = document.querySelector('#participants');

const chatCfg0Button = document.querySelector('#chat-cfg0-button');
const chatCfg1Button = document.querySelector('#chat-cfg1-button');
const chatCfg2Button = document.querySelector('#chat-cfg2-button');
const chatCfg3Button = document.querySelector('#chat-cfg3-button');
const chatCfg4Button = document.querySelector('#chat-cfg4-button');
const chatCfg5Button = document.querySelector('#chat-cfg5-button');
const chatJoinButton = document.querySelector('#chat-join-button');
const chatLeaveButton = document.querySelector('#chat-leave-button');
const chatStatButton = document.querySelector('#chat-stat-button');

[chatCfg0Button, chatCfg1Button, chatCfg2Button, chatCfg3Button, chatCfg4Button, chatCfg5Button].forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    state.currentStreamConfiguration = cfg[idx];
    state.videochat.setStreamConfiguration(state.currentStreamConfiguration).then((stream) => {
      const { userStream, displayStream } = VieroWebRTCVideoChat.splitStream(stream);
      [userStream, displayStream].forEach((stream) => stream.getAudioTracks().forEach((t) => userStream.removeTrack(t)));
      renderParticipants([{ id: state.id, userStream, displayStream }], me, true);
    });
  });
});
chatJoinButton.addEventListener('click', () => join());
chatLeaveButton.addEventListener('click', () => leave());
chatStatButton.addEventListener('click', () => {
  // TODO: finish
  debugger;
});

state.id = VieroUID.short();
state.videochat = new VieroWebRTCVideoChat(state.id);
state.videochat.addEventListener(
  VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE,
  (evt) => console.log(`WEBRTCSTATE ${evt.detail.state} CHANGED TO ${evt.detail.value} ON ${evt.detail.id}`),
);
state.videochat.addEventListener(
  VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE,
  () => {
    renderParticipants(state.videochat.participants, participants);
  }
);

