import { io } from 'socket.io-client';

let socket = null;
let subscribedCompanyId = null;

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

  socket.on('connect', () => {
    // Re-arm the room after a reconnect so the dashboard keeps streaming.
    if (subscribedCompanyId) socket.emit('subscribe:company', subscribedCompanyId);
  });

  return socket;
}

export function subscribeCompany(companyId) {
  subscribedCompanyId = companyId;
  if (socket?.connected) socket.emit('subscribe:company', companyId);
}

export function onSocket(event, handler) {
  socket?.on(event, handler);
  return () => socket?.off(event, handler);
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  subscribedCompanyId = null;
  socket?.disconnect();
  socket = null;
}
