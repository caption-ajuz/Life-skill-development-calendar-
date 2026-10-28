import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import connectDB, { getDbStatus, retryConnection } from './server/config/db.js';
import User from './server/models/User.js';
import Team from './server/models/Team.js';
import CampaignConfig from './server/models/CampaignConfig.js';
import Distribution from './server/models/Distribution.js';
import Collection from './server/models/Collection.js';
import { mockFallbackMiddleware } from './server/middleware/mockData.js';

// Route imports
import authRouter from './server/routes/auth.js';
import usersRouter from './server/routes/users.js';
import teamsRouter from './server/routes/teams.js';
import stockRouter from './server/routes/stock.js';
import distributionsRouter from './server/routes/distributions.js';
import collectionsRouter from './server/routes/collections.js';
import transfersRouter from './server/routes/transfers.js';
import areasRouter from './server/routes/areas.js';
import dashboardRouter from './server/routes/dashboard.js';
import reportsRouter from './server/routes/reports.js';
import uploadsRouter from './server/routes/uploads.js';
import syncRouter from './server/routes/sync.js';
import expensesRouter from './server/routes/expenses.js';
import correctionsRouter from './server/routes/corrections.js';
import adminRouter from './server/routes/admin.js';
import campaignsRouter from './server/routes/campaigns.js';
import { getActiveCampaign, backfillCampaignData } from './server/utils/campaignHelper.js';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    credentials: true
  }
});

app.set('io', io);

// Security & Optimization Middleware
app.use(
  helmet({
    contentSecurityPolicy: false // Allows CDN scripts (Preact, HTM) & SVG data URIs
  })
);
app.use(compression());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Assets with no-cache on SW, HTML, and JS modules to prevent stale mobile caches
const publicDir = path.join(__dirname, 'public');
app.use(
  express.static(publicDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  })
);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Life Skill Course API'
  });
});

// Database Connection Status endpoint (Green = Connected, Red = Fallback with diagnostic details)
app.get('/api/db-status', (req, res) => {
  res.json({
    success: true,
    data: getDbStatus()
  });
});

// Database Retry Connection endpoint
app.post('/api/db-status/retry', async (req, res) => {
  try {
    const success = await retryConnection();
    if (success) {
      await seedDefaults();
    }
    res.json({
      success: true,
      connected: success,
      data: getDbStatus()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      data: getDbStatus()
    });
  }
});

// Fallback Mock Middleware: handles API requests when MongoDB is offline
app.use('/api', mockFallbackMiddleware);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/distributions', distributionsRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/areas', areasRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/campaigns', campaignsRouter);

// API 404 Handler: Guarantee JSON response for all undefined API endpoints
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// SPA Fallback: Serve index.html for all non-API GET requests
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Database Offline Error Handler Middleware
app.use((err, req, res, next) => {
  if (
    err.name === 'MongooseError' ||
    err.name === 'MongoNetworkError' ||
    (err.message && (err.message.includes('buffering timed out') || err.message.includes('before initial connection')))
  ) {
    console.warn('[AI Studio] Database offline — returning mock empty response');
    if (req.method === 'GET') {
      return res.json({ success: true, data: req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {} });
    }
    return res.status(503).json({ success: false, error: 'Database is currently offline. Running in demo mode.' });
  }
  next(err);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

// Socket.io Real-Time connection management
io.on('connection', (socket) => {
  // Client can register their room
  socket.on('join', ({ role, teamId }) => {
    if (role) socket.join(`role:${role}`);
    if (teamId) socket.join(`team:${teamId}`);
  });

  socket.on('disconnect', () => {});
});

// Seed default Admin, Teams & Campaign Config on startup
async function seedDefaults() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.log("ℹ️ MongoDB offline — skipping persistent seed.");
      return;
    }

    // Ensure Campaign Config exists
    let config = await CampaignConfig.findOne();
    if (!config) {
      config = await CampaignConfig.create({
        totalStock: 5000,
        calendarPrice: 100,
        campaignYear: 2026,
        notes: "Markazul Hidayathil Islamiyya Calendar Campaign 2026"
      });
      console.log("✅ Campaign Config initialized.");
    }

    // Ensure primary Super Admin ajash.admin exists with PIN 7863
    let admin = await User.findOne({ username: "ajash.admin" }).select("+pinHash +passwordHash");
    if (!admin) {
      const passwordHash = await bcrypt.hash("ajash.admin", 10);
      const pinHash = await bcrypt.hash("7863", 10);
      admin = await User.create({
        username: "ajash.admin",
        passwordHash,
        pinHash,
        passwordHint: "ajash.admin",
        pinHint: "7863",
        fullName: "Ajash (Super Admin)",
        phone: "8281245976",
        role: "super_admin",
        isActive: true,
        mustChangePassword: false
      });
      console.log("✅ Primary Super Admin ajash.admin created in MongoDB.");
    } else {
      admin.fullName = "Ajash (Super Admin)";
      admin.phone = "8281245976";
      admin.role = "super_admin";
      admin.isActive = true;
      admin.mustChangePassword = false;
      admin.passwordHint = "ajash.admin";
      admin.pinHint = "7863";
      admin.passwordHash = await bcrypt.hash("ajash.admin", 10);
      admin.pinHash = await bcrypt.hash("7863", 10);
      await admin.save();
      console.log("✅ Primary Super Admin ajash.admin refreshed with PIN 7863 and phone 8281245976.");
    }

    // Remove legacy admin user if separate from ajash.admin
    await User.deleteMany({ username: "admin" });

  } catch (err) {
    console.error("Seed defaults error:", err);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Life Skill Course server listening on port ${PORT}`);
  console.log(`🌐 Application URL: http://0.0.0.0:${PORT}`);
});

// Attempt MongoDB connection asynchronously without blocking server startup
connectDB()
  .then(async (connected) => {
    if (connected) {
      await seedDefaults();
    }
  })
  .catch((err) => {
    console.warn('MongoDB connection note:', err.message);
  });

export { app, server, io };
