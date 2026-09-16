import { Server } from 'socket.io';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { verifyToken } from '../middleware/auth.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.cors.origins, credentials: true }
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.data.user = verifyToken(token);
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug(`socket connected: ${socket.data.user?.email}`);
    socket.join('global');

    // The dashboard subscribes to one company at a time; switching companies
    // swaps the room so a browser only receives the site it is looking at.
    socket.on('subscribe:company', (companyId) => {
      for (const room of socket.rooms) {
        if (room.startsWith('company:')) socket.leave(room);
      }
      if (companyId) socket.join(`company:${companyId}`);
    });

    socket.on('unsubscribe:company', (companyId) => {
      if (companyId) socket.leave(`company:${companyId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`socket disconnected: ${socket.data.user?.email}`);
    });
  });

  logger.info('Socket.IO gateway ready');
  return io;
}

export function emitToCompany(companyId, event, payload) {
  if (!io) return;
  io.to(`company:${companyId}`).emit(event, payload);
}

/** Alerts and device state changes go to every operator, whichever site they are viewing. */
export function emitGlobal(event, payload) {
  if (!io) return;
  io.to('global').emit(event, payload);
}

export function getIo() {
  return io;
}
