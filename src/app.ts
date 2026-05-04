import 'express-async-errors';
import express, { Application, Request, Response } from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';

import * as socketService from './services/socket';
import { socketAuth } from './middleware/auth';
import errorHandler from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import contentRoutes from './routes/contentRoutes';
import homeRoutes from './routes/homeRoutes';
import bookingRoutes from './routes/bookingRoutes';
import technicianRoutes from './routes/technicianRoutes';
import technicianPublicRoutes from './routes/technicianPublicRoutes';
import chatRoutes from './routes/chatRoutes';
import notificationRoutes from './routes/notificationRoutes';
import reviewRoutes from './routes/reviewRoutes';
import paymentRoutes from './routes/paymentRoutes';

const app: Application = express();
const httpServer = http.createServer(app);

// ─── Socket.io setup ──────────────────────────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

socketService.init(io);
io.use(socketAuth);

io.on('connection', (socket) => {
  const s = socket as unknown as { userId: string };
  socket.join(`user:${s.userId}`);

  socket.on('join:booking', ({ bookingId }: { bookingId: string }) => {
    void socket.join(`booking:${bookingId}`);
  });

  socket.on('leave:booking', ({ bookingId }: { bookingId: string }) => {
    void socket.leave(`booking:${bookingId}`);
  });

  socket.on(
    'message:send',
    async ({ bookingId, content, type = 'text' }: { bookingId: string; content: string; type?: string }) => {
      try {
        const Message = (await import('./models/Message')).default;
        const msg = await Message.create({ bookingId, senderId: s.userId, type, content });
        await msg.populate('senderId', 'name avatarUrl');
        socketService.emitNewMessage(bookingId, msg);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        socket.emit('error', { message });
      }
    }
  );

  socket.on('disconnect', () => {
    // cleanup if needed
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1', homeRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/technician', technicianRoutes);
app.use('/api/v1/technicians', technicianPublicRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/payments', paymentRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

export { app, httpServer };
