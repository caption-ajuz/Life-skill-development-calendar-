import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ override: true });

mongoose.set('bufferCommands', false); // CRITICAL: fail fast, don't hang

let lastConnectionAttempt = null;
let lastError = null;
let connectingPromise = null;

export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;

  let explanation = '';
  if (!connected) {
    if (
      lastError &&
      (lastError.includes('whitelisted') ||
        lastError.includes('whitelist') ||
        lastError.includes('SSL alert') ||
        lastError.includes('ETIMEDOUT') ||
        lastError.includes('Could not connect to any servers'))
    ) {
      explanation =
        'MongoDB Atlas IP Whitelist Required: Atlas blocked the connection. To allow access from this cloud environment: Go to cloud.mongodb.com -> Security -> Network Access -> "+ ADD IP ADDRESS" -> Select "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0) -> Confirm. Once updated, tap "Retry Connection".';
    } else if (lastError && (lastError.includes('Authentication failed') || lastError.includes('auth failed'))) {
      explanation =
        'MongoDB Authentication Failed: The database username or password in .env is incorrect. Please verify credentials under MongoDB Atlas > Security > Database Access.';
    } else {
      explanation =
        lastError || 'Operating in offline in-memory fallback mode. Portal functionality remains fully accessible.';
    }
  }

  return {
    connected,
    readyState,
    state: connected ? 'connected' : 'fallback',
    error: lastError || (!connected ? 'Operating in offline in-memory fallback mode.' : null),
    message: connected
      ? 'Connected to MongoDB Atlas Database'
      : 'Operating in Local In-Memory Fallback',
    details: connected
      ? 'Database is active and connected. All operations persist directly to MongoDB.'
      : explanation,
    rawError: lastError,
    timestamp: new Date().toISOString()
  };
}

export async function retryConnection() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return true;
  }
  if (connectingPromise) return connectingPromise;
  connectingPromise = connectDB().finally(() => {
    connectingPromise = null;
  });
  return connectingPromise;
}

async function connectDB() {
  lastConnectionAttempt = new Date();
  const DEFAULT_ATLAS_URI =
    'mongodb://muhammadajash59594_db_user:diILed5GXTwNTmPl@ac-1jk4hxc-shard-00-00.ua1dpo1.mongodb.net:27017,ac-1jk4hxc-shard-00-01.ua1dpo1.mongodb.net:27017,ac-1jk4hxc-shard-00-02.ua1dpo1.mongodb.net:27017/lifeskill?ssl=true&replicaSet=atlas-x78bqp-shard-0&authSource=admin';

  let uri = process.env.MONGODB_URI;

  // Detect unconfigured placeholder connection strings or missing URI
  const isPlaceholder =
    !uri ||
    !uri.trim() ||
    uri.includes('<') ||
    uri.includes('>') ||
    uri.includes('cluster-shard-00-00.mongodb.net') ||
    uri.includes('your-username') ||
    uri.includes('your-password') ||
    uri.includes('dummy') ||
    uri.includes('example.com');

  if (isPlaceholder) {
    uri = DEFAULT_ATLAS_URI;
  }

  try {
    // If already in connecting or connected state, close first
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (_) {}
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 6000
    });
    lastError = null;
    console.log('✅ Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    lastError = err.message || 'Connection failed';
    console.warn(`ℹ️ MongoDB connection not available (${err.message}) — operating with in-memory database.`);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    return false;
  }
}

mongoose.connection.on('connected', () => {
  lastError = null;
  console.log('📡 MongoDB Mongoose connection established.');
});

mongoose.connection.on('error', (err) => {
  lastError = err.message;
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    console.warn('⚠️ MongoDB runtime error:', err.message);
  }
});

mongoose.connection.on('disconnected', () => {
  if (!lastError) {
    lastError = 'MongoDB connection was disconnected.';
  }
});

export default connectDB;
