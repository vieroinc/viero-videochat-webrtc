
import io from 'socket.io-client';
import { VieroWebRTCVideoChatSignaling } from '../../signaling';
import { VieroError } from '@viero/common/error';

export class VieroWebRTCVideoChatSocketIoSignaling extends VieroWebRTCVideoChatSignaling {

  constructor(channel) {
    super();
    if (!channel || !/^([a-z0-9\-].*){4,}$/.test(channel)) {
      throw new VieroError('VieroWebRTCVideoChatSocketIoSignaling', 975600);
    }
    this._channel = channel;
  }

  get connected() {
    return !!this._socket;
  }

  connect() {
    if (this._socket) return;
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
    });
    admin.emit('create', { channel: this._channel });
  }

  disconnect() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = void 0;
    }
  }

  send(payload) {
    if (this._socket) {
      console.log('SND', payload);
      this._socket.emit('signal', payload);
    }
  }

}
