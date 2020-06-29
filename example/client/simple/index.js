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

import { VieroWebRTCVideoChat } from "../../..";
import { VieroWebRTCVideoChatSocketIoSignaling } from "../signaling.socketio";

const urlObj = new URL(location.href);
const channel = urlObj.searchParams.get('channel');
if (!channel) {
  urlObj.searchParams.set('channel', VieroUID.short());
  location.href = urlObj.toString();
}

const me = document.querySelector('#me');
const participants = document.querySelector('#participants');
const chatJoinButton = document.querySelector('#chat-join-button');
const chatLeaveButton = document.querySelector('#chat-leave-button');

const state = window.vierochat = {};

const join = () => {
  if (!VieroWebRTCVideoChat.canCreateUserStream()) {
    return alert('Your browser is missing the required technology!');
  }
  chatJoinButton.setAttribute('disabled', '');
  chatLeaveButton.removeAttribute('disabled');
  state.signaling = new VieroWebRTCVideoChatSocketIoSignaling(channel);
  return state.signaling.connect().then(() => {
    state.videochat.setSignaling(state.signaling);
    VieroWebRTCVideoChat.createUserStream({ video: true, audio: true })
      .then((stream) => state.videochat.setStreams([stream]))
      .then((stream) => renderParticipants([{ id: state.id, stream }], me, true));
  });
};

const leave = () => {
  chatJoinButton.removeAttribute('disabled');
  chatLeaveButton.setAttribute('disabled', '');
  if (state.signaling) {
    state.signaling.disconnect();
  }
};

const renderParticipants = (participants, container, muted) => {
  render(
    repeat(
      participants,
      (p) => p.id,
      (p) => {
        console.log(`*** rendering ${p.id} > `, p.stream.getTracks().map((t) => `${t.kind}:${t.contentHint}:${t.id}`));
        return html`<video class="participant" playsinline autoplay .srcObject=${p.stream} .muted=${!!muted}></video>`;
      },
    ),
    container,
  );
};

chatJoinButton.addEventListener('click', () => join());
chatLeaveButton.addEventListener('click', () => leave());

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
