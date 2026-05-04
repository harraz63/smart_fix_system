import 'dotenv/config';
import { httpServer } from './app';
import connectDB from './config/db';
import { initFirebase } from './config/firebase';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const start = async (): Promise<void> => {
  await connectDB();
  initFirebase();

  httpServer.listen(PORT, () => {
    console.log(`🚀 SmartFix server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
};

start().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Failed to start server:', message);
  process.exit(1);
});
