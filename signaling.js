
export class VieroWebRTCVideoChatSignaling extends EventTarget {

  get connected() {
    throw new Error('VieroWebRTCVideoChatSignaling().connected is not implemented!');
  }

  connect() {
    throw new Error('VieroWebRTCVideoChatSignaling().connect() is not implemented!');
  }

  disconnect() {
    throw new Error('VieroWebRTCVideoChatSignaling().disconnect() is not implemented!');
  }

  send() {
    throw new Error('VieroWebRTCVideoChatSignaling().send(...) is not implemented!');
  }

  dispatchSignal(detail) {
    this.dispatchEvent(new CustomEvent(VieroWebRTCVideoChatSignaling.EVENT.SIGNAL, { detail }));
  }

}

VieroWebRTCVideoChatSignaling.EVENT = {
  SIGNAL: 'signal',
};
