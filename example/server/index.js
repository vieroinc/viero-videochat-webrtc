'use strict';

const io = require('socket.io')(8181, { serveClient: false, origins: ['client.vcdemo.viero.tv:*', '127.0.0.1:*'] });

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
        socket.broadcast.emit('signal', payload);
      });
    });
    socket.emit('created');
  });
});
