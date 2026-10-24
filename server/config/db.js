import mongoose from 'mongoose';

mongoose.set('bufferCommands', false); // CRITICAL: fail fast, don't hang

let lastConnectionAttempt = null;
let lastError = null;

export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;
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
      : (lastError || 'MongoDB is not reachable or unconfigured. All portal operations use the local in-memory fallback dataset safely without downtime.'),
    timestamp: new Date().toISOString()
  };
}

async function connectDB() {
  lastConnectionAttempt = new Date();
  const uri = process.env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    lastError = 'MONGODB_URI environment variable is not defined.';
    console.log('ℹ️ MONGODB_URI not provided — operating with in-memory database.');
    return false;
  }

  // Detect unconfigured placeholder connection strings
  const isPlaceholder =
    uri.includes('<') ||
    uri.includes('>') ||
    uri.includes('cluster-shard-00-00.mongodb.net') ||
    uri.includes('your-username') ||
    uri.includes('your-password') ||
    uri.includes('dummy') ||
    uri.includes('example.com');

  if (isPlaceholder) {
    lastError = 'MONGODB_URI contains unconfigured template placeholders (e.g. cluster-shard-00-00.mongodb.net).';
    console.log('ℹ️ MONGODB_URI contains unconfigured template placeholders — operating with in-memory database.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500,
      socketTimeoutMS: 5000
    });
    lastError = null;
    console.log('✅ Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    lastError = `Connection failed: ${err.message}`;
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
