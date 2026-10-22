import mongoose from 'mongoose';

mongoose.set('bufferCommands', false); // CRITICAL: fail fast, don't hang

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('⚠️ MONGODB_URI not provided — running with offline fallback');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000,
      socketTimeoutMS: 10000
    });
    console.log('✅ Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed: ${err.message}. Operating with in-memory fallback.`);
    return false;
  }
}

mongoose.connection.on('connected', () => {
  console.log('📡 MongoDB Mongoose connection established.');
});

mongoose.connection.on('error', (err) => {
  console.warn('⚠️ MongoDB runtime error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected.');
});

export default connectDB;
