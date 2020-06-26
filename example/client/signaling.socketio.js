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

import io from 'socket.io-client';
import { VieroWebRTCVideoChatSignaling } from '../../signaling';
import { VieroError } from '@viero/common/error';

export class VieroWebRTCVideoChatSocketIoSignaling extends VieroWebRTCVideoChatSignaling {

  constructor(channel) {
    super();
    if (!channel || !/^([a-zA-Z0-9\-].*){4,}$/.test(channel)) {
      throw new VieroError('VieroWebRTCVideoChatSocketIoSignaling', 975600);
    }
    this._channel = channel;
  }

  get connected() {
    return !!this._socket;
  }

  connect() {
    return new Promise((resolve) => {
      if (this._socket) return resolve();
      const baseUrl = ['127.0.0.1', 'localhost'].includes(new URL(location.href).hostname) ? 'http://127.0.0.1:8181' : 'https://signaling.vcdemo.viero.tv';
      const admin = io(`${baseUrl}/admin`);
      admin.on('created', () => {
        this._socket = io(`${baseUrl}/${this._channel}`);
        this._socket.on('signal', (payload) => {
          if (payload) {
            console.log('RCV', payload);
            this.dispatchSignal(payload);
          }
        });
        admin.disconnect();
        resolve();
      });
      admin.emit('create', { channel: this._channel });
    });
  }

  disconnect() {
    return new Promise((resolve) => {
      if (this._socket) {
        this._socket.disconnect();
        this._socket = void 0;
      }
      resolve();
    });
  }

  send(payload) {
    if (this._socket) {
      console.log('SND', payload);
      this._socket.emit('signal', payload);
    }
  }

}
