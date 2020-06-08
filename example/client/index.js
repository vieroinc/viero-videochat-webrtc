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

import { v4 as uuidv4 } from 'uuid';
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';

import { VieroWebRTCVideoChat } from "../..";
import { VieroWebRTCVideoChatSignaling } from "../../signaling";
import { VieroWebRTCVideoChatSocketIoSignaling } from "./signaling.socketio";

const stats = document.querySelector('#stats');
const videos = document.querySelector('#videos');
const chatButton = document.querySelector('#chat-button');
const statButton = document.querySelector('#stat-button');
const statsRegistry = {
  prepared: [],
  joined: [],
};

let signaling;
let id;

const vchat = VieroWebRTCVideoChat.sharedInstance;
vchat.configure();
vchat.addEventListener(
  VieroWebRTCVideoChat.EVENT.STATE_DID_CHANGE,
  (evt) => console.log(`STATE CHANGED TO ${evt.detail.state}`),
);
vchat.addEventListener(
  VieroWebRTCVideoChat.EVENT.WEBRTC_STATE_DID_CHANGE,
  (evt) => console.log(`WEBRTC STATE OF ${evt.detail.id}: ${evt.detail.state} = ${evt.detail.value}`),
);
vchat.addEventListener(
  VieroWebRTCVideoChat.EVENT.PARTICIPANTS_DID_CHANGE,
  () => {
    console.log('PARTICIPANTS DID CHANGE > UPDATING VIDEOS');
    render(
      repeat(
        vchat.participants,
        (p) => p.actor,
        (p) => html`<video id=${p.actor} playsinline autoplay .muted=${p.id === id} .srcObject=${p.stream}><video>`,
      ),
      videos,
    );
  }
);

statButton.addEventListener('click', () => {
  if (signaling && signaling.connected) {
    resetStats();
    stats.textContent = 'If you read this you are the only one in the channel yet';
    signaling.send({ word: 'who' });
  } else {
    stats.textContent = 'No stats prior you press "Prepare"';
  }
});

const resetStats = () => {
  statsRegistry.prepared.length = 0;
  statsRegistry.joined.length = 0;
  stats.textContent = '';
};

const renderStats = () => {
  let myState;
  switch (vchat.state) {
    case VieroWebRTCVideoChat.STATE.PREPARED: {
      myState = 'prepared';
      break;
    }
    case VieroWebRTCVideoChat.STATE.JOINED: {
      myState = 'joined';
      break;
    }
  }
  stats.textContent = `Prepared ${statsRegistry.prepared.length}, joined ${statsRegistry.joined.length}. I am ${myState}.`;
};

const channel = new URL(location.href).searchParams.get('channel');
if (!channel) {
  alert('Please set a channel in the URL, eg: http://<host>:<port>?channel=1234-5678');
} else {
  const prepare = () => {
    signaling = new VieroWebRTCVideoChatSocketIoSignaling(channel);
    signaling.addEventListener(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, (evt) => {
      switch (evt.detail.word) {
        case 'who': return signaling.send({ word: 'iam', data: { id, state: vchat.state } });
        case 'iam': {
          switch (evt.detail.data.state) {
            case VieroWebRTCVideoChat.STATE.PREPARED: {
              statsRegistry.prepared.push(evt.detail.data.id);
              return renderStats();
            }
            case VieroWebRTCVideoChat.STATE.JOINED: {
              statsRegistry.joined.push(evt.detail.data.id);
              return renderStats();
            }
          }
        }
      };
    });
    id = uuidv4();
    vchat.prepare(signaling, id);
    chatButton.removeEventListener('click', prepare);
    chatButton.addEventListener('click', join);
    chatButton.removeEventListener('click', hangup);
    chatButton.value = 'Join';
  };
  const join = () => {
    vchat.join();
    chatButton.removeEventListener('click', prepare);
    chatButton.removeEventListener('click', join);
    chatButton.addEventListener('click', hangup);
    chatButton.value = 'Hangup';
  };
  const hangup = () => {
    vchat.hangup();
    chatButton.addEventListener('click', prepare);
    chatButton.removeEventListener('click', join);
    chatButton.removeEventListener('click', hangup);
    chatButton.value = 'Prepare';
    signaling = void 0;
    id = void 0;
    resetStats();
  };
  hangup();
}

