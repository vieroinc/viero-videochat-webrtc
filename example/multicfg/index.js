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

import { VieroUID } from '../../../viero-common/uid';

import { VieroWebRTCVideoChat } from "../../..";
import { VieroWebRTCVideoChatSignaling } from "../../../signaling";
import { VieroWebRTCVideoChatSocketIoSignaling } from "../signaling.socketio";

const urlObj = new URL(location.href);
const channel = urlObj.searchParams.get('channel');
if (!channel) {
  urlObj.searchParams.set('channel', VieroUID.short());
  location.href = urlObj.toString();
}

const state = window.vierochat = { streams: {} };

const ustream = VieroWebRTCVideoChat.createUserStream;
const dstream = VieroWebRTCVideoChat.createDisplayStream;
const createStreams = [
  () => Promise.all([ustream({ video: true, audio: true })])
    .then(([user]) => {
      return {
        streams: [user],
        intents: {
          [user.getVideoTracks()[0].id]: 'camera',
          [user.getAudioTracks()[0].id]: 'microphone',
        }
      };
    }), // 0
  () => Promise.all([ustream({ video: true })])
    .then(([user]) => {
      return {
        streams: [user],
        intents: {
          [user.getVideoTracks()[0].id]: 'camera',
        }
      };
    }), // 1
  () => Promise.all([ustream({ audio: true })])
    .then(([user]) => {
      return {
        streams: [user],
        intents: {
          [user.getAudioTracks()[0].id]: 'microphone',
        }
      };
    }), // 2
  () => Promise.all([ustream({ audio: true }), dstream({ video: true })])
    .then(([user, display]) => {
      return {
        streams: [user, display],
        intents: {
          [user.getAudioTracks()[0].id]: 'microphone',
          [display.getVideoTracks()[0].id]: 'screen',
        }
      };
    }), // 3
  () => Promise.all([dstream({ video: true })])
    .then(([display]) => {
      return {
        streams: [display],
        intents: {
          [display.getVideoTracks()[0].id]: 'screen',
        }
      };
    }), // 4
  () => Promise.all([ustream({ video: true, audio: true }), dstream({ video: true })])
    .then(([user, display]) => {
      return {
        streams: [user, display],
        intents: {
          [user.getVideoTracks()[0].id]: 'camera',
          [user.getAudioTracks()[0].id]: 'microphone',
          [display.getVideoTracks()[0].id]: 'screen',
        }
      };
    }), // 5
  () => [], // 6
];

const onSignal = (evt) => {
  if (evt.detail.to !== state.id) {
    return;
  }
  switch (evt.detail.word) {
    case 'example-needintents': {
      console.log('*** received example-needintents from', evt.detail.from, 'answering');
      return state.signaling.send({
        word: 'example-intents',
        from: state.id,
        to: evt.detail.from,
        data: state.currentStreamStruct.intents,
        includeMe: true,
      });
    }
  }
};

const join = () => {
  chatJoinButton.setAttribute('disabled', '');
  state.signaling = new VieroWebRTCVideoChatSocketIoSignaling(channel);
  state.signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, onSignal);
  return state.signaling.connect().then(() => {
    state.videochat.setSignaling(state.signaling);
    chatLeaveButton.removeAttribute('disabled');
    state.videochat.setStreams();
  });
};

const leave = () => {
  chatJoinButton.removeAttribute('disabled');
  chatLeaveButton.setAttribute('disabled', '');
  if (state.signaling) {
    state.signaling.disconnect();
    state.signaling.removeEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, onSignal);
    state.videochat.setSignaling().then(() => renderParticipants(state.videochat.participants, participants));
  }
};

const renderParticipants = (participants, container, muted) => {
  render(
    repeat(
      participants,
      (p) => p.id,
      (p) => {
        const streamId = p.stream.getTracks().map((t) => t.id).sort().join(':');
        if (state.streams[p.id] && state.streams[p.id][streamId]) {
          console.log(
            '*** rendering',
            state.streams[p.id][streamId].cameraStream.getTracks().map((t) => `${t.kind}:${t.contentHint}:${t.id}`),
            'in CAMERA and',
            state.streams[p.id][streamId].screenStream.getTracks().map((t) => `${t.kind}:${t.contentHint}:${t.id}`),
            'in SCREEN.',
          );
          return html`
            <div class="participant" id=${'p-' + p.id}>
              <video class="user" playsinline autoplay .srcObject=${state.streams[p.id][streamId].cameraStream} .muted=${!!muted}></video>
              <video class="display" playsinline autoplay .srcObject=${state.streams[p.id][streamId].screenStream} .muted=${!!muted}></video>
            <div>
          `;
        } else {
          state.streams[p.id] = {};
          const handler = (evt) => {
            const _container = document.querySelector(`#p-${p.id}`);
            if (evt.detail.word === 'example-intents' && evt.detail.to === state.id && evt.detail.from === p.id) {
              state.signaling.removeEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, handler);
              if (_container) {
                const screen = p.stream.getVideoTracks().filter((t) => evt.detail.data[t.id] === 'screen');
                const camera = p.stream.getVideoTracks().filter((t) => evt.detail.data[t.id] === 'camera');
                const microphone = p.stream.getAudioTracks().filter((t) => evt.detail.data[t.id] === 'microphone');
                const cameraStream = new MediaStream([...camera, ...microphone]);
                const screenStream = new MediaStream([...screen]);
                state.streams[p.id][streamId] = { cameraStream, screenStream };
                render(html`
                  <video class="user" playsinline autoplay .srcObject=${state.streams[p.id][streamId].cameraStream} .muted=${!!muted}></video>
                  <video class="display" playsinline autoplay .srcObject=${state.streams[p.id][streamId].screenStream} .muted=${!!muted}></video>
                `, _container);
              }
            }
          };
          state.signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, handler);
          state.signaling.send({ word: 'example-needintents', from: state.id, to: p.id, includeMe: true });
          return html`<div class="participant" id=${'p-' + p.id}><div>`;
        }

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
const chatCfg6Button = document.querySelector('#chat-cfg6-button');
const chatJoinButton = document.querySelector('#chat-join-button');
const chatLeaveButton = document.querySelector('#chat-leave-button');
const chatStatButton = document.querySelector('#chat-stat-button');

[chatCfg0Button, chatCfg1Button, chatCfg2Button, chatCfg3Button, chatCfg4Button, chatCfg5Button, chatCfg6Button].forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    createStreams[idx]().then((struct) => {
      const muxed = state.videochat.setStreams(struct.streams);
      state.currentStreamStruct = struct;
      state.streams[state.id] = {
        streamId: { cameraStream, screenStream }
      };
      renderParticipants([{ id: state.id, stream: muxed }], me, true);
    });
  });
});
chatJoinButton.addEventListener('click', () => join());
chatLeaveButton.addEventListener('click', () => leave());
chatStatButton.addEventListener('click', () => {
  alert('Stats is not yet implemented :(');
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

if (!VieroWebRTCVideoChat.canCreateUserStream()) {
  document.querySelectorAll('input.user').forEach((ele) => ele.setAttribute('disabled', ''));
}

if (!VieroWebRTCVideoChat.canCreateDisplayStream()) {
  document.querySelectorAll('input.display').forEach((ele) => ele.setAttribute('disabled', ''));
}


