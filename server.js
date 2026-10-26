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
      console.log('ℹ️ MongoDB offline — skipping persistent seed.');
      return;
    }

    // 1. Teams
    let hudaTeam = await Team.findOne({ name: 'Al-Huda Team' });
    if (!hudaTeam) {
      hudaTeam = await Team.create({
        name: 'Al-Huda Team',
        description: 'Central District Team',
        isActive: true
      });
      await Team.create({
        name: 'Al-Noor Team',
        description: 'North Zone Team',
        isActive: true
      });
      await Team.create({
        name: 'Al-Farooq Team',
        description: 'South Zone Team',
        isActive: true
      });
      await Team.create({
        name: 'Al-Bayan Team',
        description: 'East Zone Team',
        isActive: true
      });
      console.log('✅ Default Teams created in MongoDB.');
    }

    // 2. Admin (PIN 1111)
    const defaultAdminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    let admin = await User.findOne({ role: 'super_admin' }).select('+pinHash');
    if (!admin) {
      const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);
      const pinHash = await bcrypt.hash('1111', 10);
      admin = await User.create({
        username: 'admin',
        passwordHash,
        pinHash,
        passwordHint: defaultAdminPassword,
        pinHint: '1111',
        fullName: 'Super Admin',
        phone: '9876543210',
        role: 'super_admin',
        isActive: true
      });
      console.log('✅ Default Super Admin created in MongoDB (username: admin, PIN: 1111)');
    } else {
      let needsSave = false;
      if (!admin.pinHash) {
        admin.pinHash = await bcrypt.hash('1111', 10);
        needsSave = true;
      }
      if (!admin.passwordHint) {
        admin.passwordHint = defaultAdminPassword;
        needsSave = true;
      }
      if (!admin.pinHint) {
        admin.pinHint = '1111';
        needsSave = true;
      }
      if (needsSave) await admin.save();
    }

    // 3. Usthad (PIN 2222)
    let usthad = await User.findOne({ role: 'usthad' }).select('+pinHash');
    if (!usthad) {
      const passwordHash = await bcrypt.hash('usthad123', 10);
      const pinHash = await bcrypt.hash('2222', 10);
      usthad = await User.create({
        username: 'usthad',
        passwordHash,
        pinHash,
        passwordHint: 'usthad123',
        pinHint: '2222',
        fullName: 'Usthad Abdullah',
        phone: '9876543211',
        role: 'usthad',
        isActive: true
      });
      console.log('✅ Default Usthad created in MongoDB (username: usthad, PIN: 2222)');
    } else if (!usthad.passwordHint || !usthad.pinHint) {
      if (!usthad.passwordHint) usthad.passwordHint = 'usthad123';
      if (!usthad.pinHint) usthad.pinHint = '2222';
      await usthad.save();
    }

    // 4. Team Leader (PIN 3333)
    let leader = await User.findOne({ role: 'team_leader' }).select('+pinHash');
    if (!leader) {
      const passwordHash = await bcrypt.hash('leader123', 10);
      const pinHash = await bcrypt.hash('3333', 10);
      leader = await User.create({
        username: 'leader1',
        passwordHash,
        pinHash,
        passwordHint: 'leader123',
        pinHint: '3333',
        fullName: 'Ahmed Bilal',
        phone: '9876543212',
        role: 'team_leader',
        teamId: hudaTeam._id,
        isActive: true
      });
      console.log('✅ Default Team Leader created in MongoDB (username: leader1, PIN: 3333)');
    } else if (!leader.passwordHint || !leader.pinHint) {
      if (!leader.passwordHint) leader.passwordHint = 'leader123';
      if (!leader.pinHint) leader.pinHint = '3333';
      await leader.save();
    }

    // 5. Team Member (PIN 4444)
    let member = await User.findOne({ role: 'team_member' }).select('+pinHash');
    if (!member) {
      const passwordHash = await bcrypt.hash('member123', 10);
      const pinHash = await bcrypt.hash('4444', 10);
      member = await User.create({
        username: 'member1',
        passwordHash,
        pinHash,
        passwordHint: 'member123',
        pinHint: '4444',
        fullName: 'Zaid Rahman',
        phone: '9876543213',
        role: 'team_member',
        teamId: hudaTeam._id,
        isActive: true
      });
      console.log('✅ Default Team Member created in MongoDB (username: member1, PIN: 4444)');
    } else if (!member.passwordHint || !member.pinHint) {
      if (!member.passwordHint) member.passwordHint = 'member123';
      if (!member.pinHint) member.pinHint = '4444';
      await member.save();
    }

    // 6. Campaign Config
    const configExists = await CampaignConfig.findOne();
    if (!configExists) {
      await CampaignConfig.create({
        totalStock: 5000,
        calendarPrice: 100,
        initialInvestment: 20000,
        printingCost: 50000,
        campaignYear: new Date().getFullYear(),
        notes: 'Markazul Hidayathil Islamiyya Calendar Campaign'
      });
      console.log('✅ Default Campaign Configuration initialized in MongoDB');
    }

    // 7. Seed initial distributions & collections if database has no active records
    const distCount = await Distribution.countDocuments();
    if (distCount === 0 && leader && member && hudaTeam) {
      await Distribution.create({
        memberId: member._id,
        teamId: hudaTeam._id,
        quantity: 50,
        date: new Date(),
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: leader._id,
        approvedAt: new Date(),
        notes: 'Opening distribution'
      });
      await Collection.create({
        memberId: member._id,
        teamId: hudaTeam._id,
        amount: 5000,
        date: new Date(),
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: leader._id,
        approvedAt: new Date(),
        notes: 'Opening collection'
      });
      console.log('✅ Initial distributions and collections seeded in MongoDB.');
    }
  } catch (err) {
    console.error('Seeding error:', err.message);
  }
}

// Start Server immediately on 0.0.0.0:3000 (or process.env.PORT for Render/production)
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
