import { Server } from 'socket.io';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { getState } from '../state.js';
import { verifyToken } from '../middleware/auth.js';
import { findUserById } from '../store/users.store.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.cors.origins, credentials: true }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyToken(token);
      if (payload.purpose !== 'session') return next(new Error('unauthorized'));
      const user = await findUserById(payload.sub);
      if (!user || !user.active) return next(new Error('unauthorized'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug(`socket connected: ${socket.id} (${socket.data.user?.email})`);

    const snapshot = getState();
    socket.emit('bootstrap', {
      linkConnected: snapshot.linkConnected,
      reading: snapshot.reading,
      logs: snapshot.logs
    });

    socket.on('disconnect', () => logger.debug(`socket disconnected: ${socket.id}`));
  });

  logger.info('Socket.IO gateway ready');
  return io;
}

export function emitReading(payload) {
  io?.emit('reading', payload);
}

export function emitLog(entry) {
  io?.emit('log', entry);
}

export function emitLinkStatus(connected) {
  io?.emit('link:status', { connected, ts: new Date().toISOString() });
}

export function getIo() {
  return io;
}
