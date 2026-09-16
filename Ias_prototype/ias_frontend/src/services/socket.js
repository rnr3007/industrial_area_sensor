import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) return socket;
  if (socket) socket.disconnect();

  const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;

  socket = io(url, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10000
  });

  return socket;
}

export function onSocket(event, handler) {
  socket?.on(event, handler);
  return () => socket?.off(event, handler);
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
