import admin from 'firebase-admin';

let initialized = false;

export const initFirebase = (): boolean => {
  const { FCM_PROJECT_ID, FCM_PRIVATE_KEY, FCM_CLIENT_EMAIL } = process.env;
  if (!FCM_PROJECT_ID || !FCM_PRIVATE_KEY || !FCM_CLIENT_EMAIL) {
    console.warn('⚠️  FCM credentials not set — push notifications disabled');
    return false;
  }
  if (initialized) return true;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FCM_PROJECT_ID,
      privateKey: FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: FCM_CLIENT_EMAIL,
    }),
  });

  initialized = true;
  console.log('✅ Firebase initialized');
  return true;
};

export { admin };
export default admin;
