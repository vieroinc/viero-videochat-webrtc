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

const io = require('socket.io')(8181, { serveClient: false, origins: ['client.vcdemo.viero.tv:*', 'localhost:*', '127.0.0.1:*'] });

const namespaces = {};

io.of('/admin').on('connection', (socket) => {
  socket.on('create', (payload) => {
    const name = payload.channel;
    if (!name) return;
    let channel = namespaces[name];
    if (channel) {
      socket.emit('created');
      return console.log('CHN =', name);
    }
    console.log('CHN +', name);
    channel = io.of(`/${name}`);
    namespaces[name] = channel;

    channel.on('connection', (socket) => {
      socket.on('signal', (payload) => {
        console.log('REC', name, payload);
        if (payload.includeMe) {
          channel.emit('signal', payload);
        } else {
          socket.broadcast.emit('signal', payload);
        }
      });
    });
    socket.emit('created');
  });
});
