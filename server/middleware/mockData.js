import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { buildDailyReport, buildOverallReport, buildCustomWhatsAppReport } from '../utils/whatsappReports.js';
import { getDbStatus } from '../config/db.js';

// In-memory fallback dataset for offline/preview mode
const mockStore = {
  campaign: {
    totalStock: 5000,
    calendarPrice: 100,
    initialInvestment: 20000,
    printingCost: 50000,
    campaignYear: new Date().getFullYear(),
    notes: 'Markazul Hidayathil Islamiyya Calendar Campaign'
  },
  teams: [
    {
      _id: '65f000000000000000000011',
      name: 'Al-Huda Team',
      description: 'Central District Team',
      isActive: true,
      memberCount: 4,
      totalDistributed: 450,
      totalCollected: 45000,
      allocatedStock: 800,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000012',
      name: 'Al-Noor Team',
      description: 'North Zone Team',
      isActive: true,
      memberCount: 3,
      totalDistributed: 350,
      totalCollected: 35000,
      allocatedStock: 600,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000013',
      name: 'Al-Farooq Team',
      description: 'South Zone Team',
      isActive: true,
      memberCount: 3,
      totalDistributed: 250,
      totalCollected: 25000,
      allocatedStock: 400,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000014',
      name: 'Al-Bayan Team',
      description: 'East Zone Team',
      isActive: true,
      memberCount: 2,
      totalDistributed: 200,
      totalCollected: 20000,
      allocatedStock: 300,
      createdAt: new Date().toISOString()
    }
  ],
  users: [
    {
      _id: '65f000000000000000000001',
      username: 'admin',
      fullName: 'Super Admin',
      phone: '9876543210',
      role: 'super_admin',
      passwordHint: 'admin123',
      pinHint: '1111',
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000002',
      username: 'usthad',
      fullName: 'Usthad Abdullah',
      phone: '9876543211',
      role: 'usthad',
      passwordHint: 'usthad123',
      pinHint: '2222',
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000003',
      username: 'leader1',
      fullName: 'Ahmed Bilal',
      phone: '9876543212',
      role: 'team_leader',
      passwordHint: 'leader123',
      pinHint: '3333',
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000004',
      username: 'member1',
      fullName: 'Zaid Rahman',
      phone: '9876543213',
      role: 'team_member',
      passwordHint: 'member123',
      pinHint: '4444',
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ],
  areas: [
    {
      _id: '65f000000000000000000031',
      name: 'Downtown Commercial',
      district: 'Central',
      totalDistributed: 400,
      totalCollected: 40000,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000032',
      name: 'Riverside Residential',
      district: 'North',
      totalDistributed: 350,
      totalCollected: 35000,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000033',
      name: 'Industrial Estate',
      district: 'East',
      totalDistributed: 300,
      totalCollected: 30000,
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000034',
      name: 'Hilltop Suburb',
      district: 'South',
      totalDistributed: 200,
      totalCollected: 20000,
      createdAt: new Date().toISOString()
    }
  ],
  allocations: [
    {
      _id: '65f000000000000000000041',
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      memberId: null,
      quantity: 800,
      allocatedBy: { fullName: 'Super Admin' },
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000042',
      teamId: { _id: '65f000000000000000000012', name: 'Al-Noor Team' },
      memberId: null,
      quantity: 600,
      allocatedBy: { fullName: 'Super Admin' },
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000043',
      teamId: { _id: '65f000000000000000000013', name: 'Al-Farooq Team' },
      memberId: null,
      quantity: 400,
      allocatedBy: { fullName: 'Super Admin' },
      createdAt: new Date().toISOString()
    },
    {
      _id: '65f000000000000000000044',
      teamId: { _id: '65f000000000000000000014', name: 'Al-Bayan Team' },
      memberId: null,
      quantity: 300,
      allocatedBy: { fullName: 'Super Admin' },
      createdAt: new Date().toISOString()
    }
  ],
  distributions: [
    {
      _id: '65f000000000000000000051',
      quantity: 50,
      date: new Date().toISOString(),
      memberId: { _id: '65f000000000000000000003', fullName: 'Ahmed Bilal', phone: '9876543212' },
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      areaId: { name: 'Downtown Commercial', district: 'Central' },
      recipientName: 'City Center Bookstore',
      recipientPhone: '9876543290',
      status: 'approved',
      approvalStatus: 'approved'
    },
    {
      _id: '65f000000000000000000052',
      quantity: 30,
      date: new Date().toISOString(),
      memberId: { _id: '65f000000000000000000004', fullName: 'Zaid Rahman', phone: '9876543213' },
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      areaId: { name: 'Riverside Residential', district: 'North' },
      recipientName: 'Community Library',
      recipientPhone: '9876543291',
      status: 'approved',
      approvalStatus: 'approved'
    }
  ],
  collections: [
    {
      _id: '65f000000000000000000061',
      amount: 5000,
      date: new Date().toISOString(),
      memberId: { _id: '65f000000000000000000003', fullName: 'Ahmed Bilal', phone: '9876543212' },
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      areaId: { name: 'Downtown Commercial', district: 'Central' },
      collectedFrom: 'City Center Bookstore',
      status: 'approved',
      approvalStatus: 'approved'
    },
    {
      _id: '65f000000000000000000062',
      amount: 3000,
      date: new Date().toISOString(),
      memberId: { _id: '65f000000000000000000004', fullName: 'Zaid Rahman', phone: '9876543213' },
      teamId: { _id: '65f000000000000000000011', name: 'Al-Huda Team' },
      areaId: { name: 'Riverside Residential', district: 'North' },
      collectedFrom: 'Community Library',
      status: 'approved',
      approvalStatus: 'approved'
    }
  ],
  transfers: [
    {
      _id: '65f000000000000000000071',
      amount: 15000,
      transferDate: new Date().toISOString(),
      fromUserId: { fullName: 'Ahmed Bilal', phone: '9876543212', role: 'team_leader' },
      teamId: { name: 'Al-Huda Team' },
      paymentMethod: 'bank_transfer',
      status: 'confirmed',
      confirmedBy: { fullName: 'Super Admin' }
    },
    {
      _id: '65f000000000000000000072',
      amount: 5000,
      transferDate: new Date().toISOString(),
      fromUserId: { fullName: 'Zaid Rahman', phone: '9876543213', role: 'team_member' },
      teamId: { name: 'Al-Huda Team' },
      paymentMethod: 'cash',
      status: 'pending'
    }
  ],
  expenses: [
    {
      _id: '65f000000000000000000081',
      category: 'printing',
      description: 'First batch calendar printing 5,000 units',
      amount: 50000,
      date: new Date().toISOString(),
      createdBy: { fullName: 'Super Admin' }
    },
    {
      _id: '65f000000000000000000082',
      category: 'transport',
      description: 'Distribution logistics & delivery to team centers',
      amount: 5000,
      date: new Date().toISOString(),
      createdBy: { fullName: 'Super Admin' }
    }
  ],
  corrections: [
    {
      _id: '65f000000000000000000091',
      entityType: 'distribution',
      entityId: '65f000000000000000000051',
      reason: 'Entered 50 calendars instead of 40 delivered to bookstore',
      oldValues: { quantity: 50, recipientName: 'City Center Bookstore' },
      newValues: { quantity: 40, recipientName: 'City Center Bookstore' },
      requestedBy: { _id: '65f000000000000000000003', fullName: 'Ahmed Bilal', username: 'leader1', role: 'team_leader' },
      approvedBy: null,
      status: 'pending',
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      _id: '65f000000000000000000092',
      entityType: 'collection',
      entityId: '65f000000000000000000062',
      reason: 'Receipt typo in collected cash amount',
      oldValues: { amount: 3000, collectedFrom: 'Community Library' },
      newValues: { amount: 3500, collectedFrom: 'Community Library' },
      requestedBy: { _id: '65f000000000000000000004', fullName: 'Zaid Rahman', username: 'member1', role: 'team_member' },
      approvedBy: { _id: '65f000000000000000000001', fullName: 'Super Admin', username: 'admin', role: 'super_admin' },
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 7200000).toISOString()
    }
  ]
};

export function mockFallbackMiddleware(req, res, next) {
  // If MongoDB is actively connected, allow normal Mongoose routes to handle it
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return next();
  }

  const { method, path } = req;
  const secret = process.env.JWT_SECRET || 'life-skill-default-secret-change-in-prod';

  // Helper to extract or fallback user
  const getUserFromToken = () => {
    let token = null;
    if (req.cookies && req.cookies.token) token = req.cookies.token;
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }
    if (!token) return mockStore.users[0]; // Super Admin fallback
    try {
      const decoded = jwt.verify(token, secret);
      const found = mockStore.users.find(u => u._id === decoded.userId);
      return found || mockStore.users[0];
    } catch {
      return mockStore.users[0];
    }
  };

  // Database Connection Status endpoint
  if (path === '/db-status' && method === 'GET') {
    return res.json({ success: true, data: getDbStatus() });
  }

  // Auth: /api/auth/*
  if (path === '/auth/login' && method === 'POST') {
    const { username, password, phone, pin } = req.body || {};
    const pinLogin = typeof phone === 'string' || typeof pin === 'string';
    let user;

    if (pinLogin) {
      const cleanPin = typeof pin === 'string' ? pin.trim() : '';
      if (cleanPin === '1111') {
        user = mockStore.users.find(u => u.role === 'super_admin') || mockStore.users[0];
      } else if (cleanPin === '2222') {
        user = mockStore.users.find(u => u.role === 'usthad') || mockStore.users[1];
      } else if (cleanPin === '3333') {
        user = mockStore.users.find(u => u.role === 'team_leader') || mockStore.users[2];
      } else if (cleanPin === '4444') {
        user = mockStore.users.find(u => u.role === 'team_member') || mockStore.users[3];
      } else {
        // Find user by custom pin
        user = mockStore.users.find(u => u.pinHint === cleanPin);
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid PIN. Try 1111 for Admin, 2222 for Usthad, 3333 for Leader, 4444 for Member.'
        });
      }
    } else {
      const searchName = (username || '').toLowerCase().trim();
      user = mockStore.users.find(u => u.username === searchName);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid username or password.'
        });
      }
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, teamId: user.teamId ? user.teamId._id : null },
      secret,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const safeUser = { ...user };
    delete safeUser.passwordHint;
    delete safeUser.pinHint;

    return res.json({
      success: true,
      data: {
        user: { ...safeUser, mustChangePassword: Boolean(user.mustChangePassword) },
        token,
        mustChangePassword: Boolean(user.mustChangePassword)
      }
    });
  }

  if (path === '/auth/first-login-change-password' && method === 'POST') {
    const user = getUserFromToken();
    user.mustChangePassword = false;
    const safeUser = { ...user };
    delete safeUser.passwordHint;
    delete safeUser.pinHint;
    return res.json({
      success: true,
      message: 'Password updated successfully. Welcome to your dashboard!',
      data: safeUser
    });
  }

  if (path === '/auth/me' && method === 'GET') {
    let token = null;
    if (req.cookies && req.cookies.token) token = req.cookies.token;
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }
    const user = getUserFromToken();
    const safeUser = { ...user };
    delete safeUser.passwordHint;
    delete safeUser.pinHint;
    return res.json({ success: true, data: safeUser });
  }

  if (path === '/auth/logout' && method === 'POST') {
    res.clearCookie('token');
    return res.json({ success: true, message: 'Logged out successfully.' });
  }

  if (path === '/auth/change-password' && method === 'PUT') {
    const user = getUserFromToken();
    user.mustChangePassword = false;
    return res.json({ success: true, message: 'Password updated successfully.' });
  }

  // Dashboard: /api/dashboard/*
  if (path === '/dashboard/admin' && method === 'GET') {
    return res.json({
      success: true,
      data: {
        totalTeams: mockStore.teams.length,
        totalMembers: mockStore.users.length,
        totalStock: mockStore.campaign.totalStock,
        allocatedToTeams: 2100,
        remainingCampaignStock: 2900,
        totalDistributed: 1250,
        totalCollected: 125000,
        confirmedTransfers: 100000,
        pendingTransfers: 15000,
        untransferredCollections: 10000,
        initialInvestment: mockStore.campaign.initialInvestment,
        printingCost: mockStore.campaign.printingCost,
        otherExpenses: 5000,
        totalExpenses: 75000,
        netProfitOrLoss: 50000,
        pendingTransfersCount: 1,
        flaggedEntriesCount: 0,
        teamRankings: mockStore.teams.map(t => ({
          _id: t._id,
          name: t.name,
          distributed: t.totalDistributed,
          collected: t.totalCollected
        }))
      }
    });
  }

  if (path.startsWith('/dashboard/team/') && method === 'GET') {
    const teamId = path.split('/')[3];
    const team = mockStore.teams.find(t => t._id === teamId) || mockStore.teams[0];
    return res.json({
      success: true,
      data: {
        team: { _id: team._id, name: team.name },
        stockAllocatedToTeam: team.allocatedStock,
        stockAllocatedToMembers: 500,
        unallocatedTeamStock: 300,
        totalDistributed: team.totalDistributed,
        totalCollected: team.totalCollected,
        confirmedTransfers: 35000,
        pendingTransfers: 5000,
        outstandingCollections: 5000,
        pendingCorrections: 0,
        memberProgress: mockStore.users
          .filter(u => u.role !== 'super_admin' && u.role !== 'usthad')
          .map(m => ({
            _id: m._id,
            fullName: m.fullName,
            role: m.role,
            phone: m.phone,
            allocated: 200,
            distributed: 150,
            collected: 15000
          }))
      }
    });
  }

  if (path.startsWith('/dashboard/member/') && method === 'GET') {
    const memberId = path.split('/')[3];
    const user = mockStore.users.find(u => u._id === memberId) || mockStore.users[3];
    return res.json({
      success: true,
      data: {
        member: {
          _id: user._id,
          fullName: user.fullName,
          role: user.role,
          phone: user.phone,
          team: user.teamId ? user.teamId.name : 'Al-Huda Team'
        },
        allocatedStock: 250,
        distributedStock: 180,
        remainingStock: 70,
        collectedAmount: 18000,
        confirmedTransfers: 15000,
        pendingTransfers: 2000,
        untransferredAmount: 1000,
        recentDistributions: mockStore.distributions,
        recentCollections: mockStore.collections,
        recentTransfers: mockStore.transfers
      }
    });
  }

  if (path === '/dashboard/rankings' && method === 'GET') {
    return res.json({
      success: true,
      data: {
        teamRankings: mockStore.teams.map(t => ({
          _id: t._id,
          name: t.name,
          totalDistributed: t.totalDistributed
        })),
        memberRankings: mockStore.users
          .filter(u => u.role === 'team_leader' || u.role === 'team_member')
          .map(u => ({
            _id: u._id,
            fullName: u.fullName,
            teamName: u.teamId ? u.teamId.name : 'Al-Huda Team',
            totalDistributed: 150
          }))
      }
    });
  }

  // Teams: /api/teams/*
  if (path === '/teams' || path === '/teams/') {
    if (method === 'GET') {
      return res.json({ success: true, data: mockStore.teams });
    }
    if (method === 'POST') {
      const newTeam = {
        _id: '65f0000000000000000000' + (mockStore.teams.length + 15),
        name: req.body.name || 'New Team',
        description: req.body.description || '',
        isActive: true,
        memberCount: 0,
        totalDistributed: 0,
        totalCollected: 0,
        allocatedStock: 0,
        createdAt: new Date().toISOString()
      };
      mockStore.teams.push(newTeam);
      return res.status(201).json({ success: true, data: newTeam });
    }
  }

  if (path.startsWith('/teams/') && method === 'GET') {
    const id = path.split('/')[2];
    const team = mockStore.teams.find(t => t._id === id) || mockStore.teams[0];
    return res.json({
      success: true,
      data: {
        ...team,
        members: mockStore.users.filter(u => u.teamId && u.teamId._id === team._id)
      }
    });
  }

  // Users: /api/users/*
  if (path === '/users' || path === '/users/') {
    if (method === 'GET') {
      const safeUsers = mockStore.users.map(u => {
        const copy = { ...u };
        delete copy.passwordHint;
        delete copy.pinHint;
        return copy;
      });
      return res.json({
        success: true,
        data: {
          users: safeUsers,
          pagination: { total: mockStore.users.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const caller = getUserFromToken();
      let role = req.body.role || 'team_member';
      let teamObj = req.body.teamId ? mockStore.teams.find(t => t._id === req.body.teamId) : null;

      // Strict scoping for Team Leader:
      if (caller.role === 'team_leader') {
        role = 'team_member';
        teamObj = caller.teamId ? mockStore.teams.find(t => t._id === (caller.teamId._id || caller.teamId)) : mockStore.teams[0];
      }

      const tempPassword = req.body.password || `LSC@${Math.floor(1000 + Math.random() * 9000)}`;
      const newUser = {
        _id: '65f0000000000000000000' + (mockStore.users.length + 5),
        username: (req.body.username || '').toLowerCase().trim(),
        fullName: req.body.fullName || 'New Member',
        phone: req.body.phone || '9876543299',
        role,
        teamId: teamObj,
        mustChangePassword: true,
        isActive: true,
        passwordHint: tempPassword,
        pinHint: req.body.pin ? req.body.pin.trim() : null,
        createdAt: new Date().toISOString()
      };
      mockStore.users.push(newUser);

      const safeUser = { ...newUser };
      delete safeUser.passwordHint;
      delete safeUser.pinHint;

      return res.status(201).json({
        success: true,
        data: safeUser,
        initialCredentials: {
          username: newUser.username,
          temporaryPassword: tempPassword,
          pin: newUser.pinHint,
          mustChangePassword: true
        }
      });
    }
  }

  // Individual Member Profile
  if (path.startsWith('/users/') && path.endsWith('/profile') && method === 'GET') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id) || mockStore.users[3];
    const safeUser = { ...user };
    delete safeUser.passwordHint;
    delete safeUser.pinHint;

    const userDist = mockStore.distributions.filter(d => d.memberId && (d.memberId._id === user._id || d.memberId.fullName === user.fullName));
    const userCol = mockStore.collections.filter(c => c.memberId && (c.memberId._id === user._id || c.memberId.fullName === user.fullName));
    const userTrans = mockStore.transfers.filter(t => t.fromUserId && (t.fromUserId._id === user._id || t.fromUserId.fullName === user.fullName));
    const userExp = mockStore.expenses.filter(e => e.memberId === user._id || (e.createdBy && e.createdBy._id === user._id));

    const distributedStock = userDist.reduce((s, d) => s + (d.quantity || 0), 0) || 180;
    const calendarCollections = userCol.reduce((s, c) => s + (c.amount || 0), 0) || 18000;
    const confirmedTransfers = userTrans.filter(t => t.status === 'confirmed').reduce((s, t) => s + (t.amount || 0), 0) || 15000;
    const pendingTransfers = userTrans.filter(t => t.status === 'pending').reduce((s, t) => s + (t.amount || 0), 0) || 2000;
    const totalExpenses = userExp.reduce((s, e) => s + (e.amount || 0), 0) || 0;

    return res.json({
      success: true,
      data: {
        user: safeUser,
        stats: {
          allocatedStock: distributedStock + 70,
          distributedStock,
          remainingStock: 70,
          calendarCollections,
          otherIncome: 0,
          totalCollected: calendarCollections,
          confirmedTransfers,
          pendingTransfers,
          inHandCash: Math.max(0, calendarCollections - confirmedTransfers - pendingTransfers),
          totalExpenses
        },
        activity: {
          distributions: userDist.length > 0 ? userDist : mockStore.distributions,
          collections: userCol.length > 0 ? userCol : mockStore.collections,
          transfers: userTrans.length > 0 ? userTrans : mockStore.transfers,
          expenses: userExp
        }
      }
    });
  }

  // Toggle active/inactive
  if (path.startsWith('/users/') && path.endsWith('/toggle-active') && method === 'PUT') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    user.isActive = !user.isActive;
    return res.json({ success: true, data: { id: user._id, isActive: user.isActive } });
  }

  // Reset password
  if (path.startsWith('/users/') && path.endsWith('/reset-password') && method === 'PUT') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    const tempPassword = req.body.newPassword || `LSC@${Math.floor(1000 + Math.random() * 9000)}`;
    user.passwordHint = tempPassword;
    user.mustChangePassword = true;
    return res.json({
      success: true,
      message: 'Temporary password generated successfully.',
      temporaryPassword: tempPassword,
      mustChangePassword: true
    });
  }

  // Reset PIN
  if (path.startsWith('/users/') && path.endsWith('/reset-pin') && method === 'PUT') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    const cleanPin = req.body.newPin ? req.body.newPin.trim() : String(Math.floor(1000 + Math.random() * 9000));
    user.pinHint = cleanPin;
    return res.json({
      success: true,
      message: 'PIN reset successfully.',
      temporaryPin: cleanPin
    });
  }

  if (path.startsWith('/users/') && path.endsWith('/credentials') && method === 'PUT') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const { username, password, pin, clearPassword, clearPin } = req.body;
    if (username) user.username = username.toLowerCase().trim();
    if (clearPassword) {
      user.passwordHint = '';
    } else if (password) {
      user.passwordHint = password;
      user.mustChangePassword = false;
    }
    if (clearPin) {
      user.pinHint = '';
    } else if (pin) {
      user.pinHint = pin.trim();
    }
    const safeUser = { ...user };
    delete safeUser.passwordHint;
    delete safeUser.pinHint;
    return res.json({ success: true, message: 'Credentials updated successfully.', data: safeUser });
  }

  if (path.startsWith('/users/') && path.endsWith('/password') && method === 'DELETE') {
    const id = path.split('/')[2];
    const user = mockStore.users.find(u => u._id === id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    user.passwordHint = '';
    return res.json({ success: true, message: 'Password cleared successfully.' });
  }

  // Areas: /api/areas/*
  if (path === '/areas' || path === '/areas/') {
    if (method === 'GET') {
      return res.json({ success: true, data: mockStore.areas });
    }
    if (method === 'POST') {
      const newArea = {
        _id: '65f0000000000000000000' + (mockStore.areas.length + 35),
        name: req.body.name || 'New Area',
        district: req.body.district || 'General',
        totalDistributed: 0,
        totalCollected: 0,
        createdAt: new Date().toISOString()
      };
      mockStore.areas.push(newArea);
      return res.status(201).json({ success: true, data: newArea });
    }
  }

  if (path === '/areas/duplicates' && method === 'GET') {
    return res.json({
      success: true,
      count: 0,
      data: []
    });
  }

  if (path.startsWith('/areas/') && path.endsWith('/aliases') && method === 'POST') {
    const id = path.split('/')[2];
    const area = mockStore.areas.find(a => a._id === id);
    if (!area) return res.status(404).json({ success: false, error: 'Area not found.' });
    if (!area.aliases) area.aliases = [];
    if (req.body.alias && !area.aliases.includes(req.body.alias.trim())) {
      area.aliases.push(req.body.alias.trim());
    }
    return res.json({ success: true, data: area });
  }

  // Stock: /api/stock/*
  if (path === '/stock/campaign' && method === 'GET') {
    return res.json({ success: true, data: mockStore.campaign });
  }

  if (path === '/stock/campaign' && method === 'PUT') {
    Object.assign(mockStore.campaign, req.body);
    return res.json({ success: true, data: mockStore.campaign });
  }

  if (path === '/stock/allocations' && method === 'GET') {
    return res.json({ success: true, data: mockStore.allocations });
  }

  if (path === '/stock/reconciliation' && method === 'GET') {
    const totalDist = mockStore.teams.reduce((s, t) => s + (t.totalDistributed || 0), 0);
    const allocatedTeams = mockStore.teams.reduce((s, t) => s + (t.allocatedStock || 0), 0);
    const unallocatedCentral = Math.max(0, mockStore.campaign.totalStock - allocatedTeams);
    const allocatedMembers = 1400;
    const unallocatedTeams = Math.max(0, allocatedTeams - allocatedMembers);
    const remainingMembers = Math.max(0, allocatedMembers - totalDist);
    const accounted = unallocatedCentral + unallocatedTeams + remainingMembers + totalDist;
    const variance = mockStore.campaign.totalStock - accounted;

    return res.json({
      success: true,
      data: {
        campaignStock: mockStore.campaign.totalStock,
        allocatedToTeams: allocatedTeams,
        unallocatedAtCentral: unallocatedCentral,
        allocatedToMembers: allocatedMembers,
        unallocatedAtTeams: unallocatedTeams,
        totalDistributed: totalDist,
        remainingWithMembers: remainingMembers,
        accountedStock: accounted,
        variance,
        reconciled: variance === 0,
        calendarPrice: mockStore.campaign.calendarPrice,
        expectedGrossRevenue: totalDist * mockStore.campaign.calendarPrice,
        teams: mockStore.teams.map(t => ({
          teamId: t._id,
          teamName: t.name,
          allocatedToTeam: t.allocatedStock,
          allocatedToMembers: Math.round(t.allocatedStock * 0.7),
          unallocatedInTeam: Math.round(t.allocatedStock * 0.3),
          distributed: t.totalDistributed,
          remainingWithMembers: Math.max(0, Math.round(t.allocatedStock * 0.7) - t.totalDistributed),
          variance: 0
        }))
      }
    });
  }

  if (path === '/stock/allocate-team' && method === 'POST') {
    const { teamId, quantity, notes } = req.body;
    const team = mockStore.teams.find(t => t._id === teamId);
    if (team) {
      team.allocatedStock = (team.allocatedStock || 0) + parseInt(quantity, 10);
    }
    const newAlloc = {
      _id: '65f0000000000000000000' + (mockStore.allocations.length + 45),
      teamId: team ? { _id: team._id, name: team.name } : null,
      memberId: null,
      quantity: parseInt(quantity, 10),
      notes,
      allocatedBy: { fullName: 'Super Admin' },
      createdAt: new Date().toISOString()
    };
    mockStore.allocations.push(newAlloc);
    return res.status(201).json({ success: true, data: newAlloc });
  }

  // Corrections: /api/corrections/*
  if (path === '/corrections' || path === '/corrections/') {
    if (method === 'GET') {
      const { status } = req.query;
      let list = mockStore.corrections;
      if (status && status !== 'all') {
        list = list.filter(c => c.status === status);
      }
      return res.json({
        success: true,
        data: {
          corrections: list,
          pagination: { total: list.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const user = getUserFromToken();
      const newCorr = {
        _id: '65f0000000000000000000' + (mockStore.corrections.length + 95),
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        reason: req.body.reason || 'Requested correction',
        oldValues: req.body.oldValues || {},
        newValues: req.body.newValues || {},
        requestedBy: { _id: user.id || '65f000000000000000000001', fullName: user.fullName || 'Requester', username: user.username || 'user', role: user.role || 'team_member' },
        approvedBy: null,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      mockStore.corrections.unshift(newCorr);
      return res.status(201).json({ success: true, data: newCorr });
    }
  }

  if (path.startsWith('/corrections/') && path.endsWith('/approve') && method === 'PUT') {
    const id = path.split('/')[2];
    const corr = mockStore.corrections.find(c => c._id === id);
    if (!corr) return res.status(404).json({ success: false, error: 'Correction not found.' });
    corr.status = 'resolved';
    corr.approvedBy = { fullName: 'Super Admin', role: 'super_admin' };
    corr.resolvedAt = new Date().toISOString();
    return res.json({ success: true, message: 'Correction approved and applied successfully.', data: corr });
  }

  if (path.startsWith('/corrections/') && path.endsWith('/reject') && method === 'PUT') {
    const id = path.split('/')[2];
    const corr = mockStore.corrections.find(c => c._id === id);
    if (!corr) return res.status(404).json({ success: false, error: 'Correction not found.' });
    corr.status = 'rejected';
    corr.approvedBy = { fullName: 'Super Admin', role: 'super_admin' };
    corr.resolvedAt = new Date().toISOString();
    if (req.body.rejectionReason) {
      corr.reason += ` [Rejection: ${req.body.rejectionReason}]`;
    }
    return res.json({ success: true, message: 'Correction request rejected.', data: corr });
  }

  // Distributions: /api/distributions/*
  if (path.startsWith('/distributions/') && path.endsWith('/approve') && method === 'PUT') {
    const user = getUserFromToken();
    if (user.role === 'team_member') {
      return res.status(403).json({ success: false, error: 'Team members are not authorized to approve entries.' });
    }
    const id = path.split('/')[2];
    const dist = mockStore.distributions.find(d => d._id === id);
    if (!dist) return res.status(404).json({ success: false, error: 'Distribution record not found.' });

    if (user.role === 'team_leader') {
      const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
      const dTeamId = dist.teamId ? (dist.teamId._id || dist.teamId) : null;
      if (uTeamId !== dTeamId) {
        return res.status(403).json({ success: false, error: 'You are only authorized to review and approve entries for your own team.' });
      }
    }

    dist.approvalStatus = 'approved';
    dist.status = 'approved';
    dist.approvedBy = { fullName: user.fullName, role: user.role };
    dist.approvedAt = new Date().toISOString();
    dist.rejectionReason = '';
    return res.json({ success: true, message: 'Distribution entry approved successfully.', data: dist });
  }

  if (path.startsWith('/distributions/') && path.endsWith('/reject') && method === 'PUT') {
    const user = getUserFromToken();
    if (user.role === 'team_member') {
      return res.status(403).json({ success: false, error: 'Team members are not authorized to reject entries.' });
    }
    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(400).json({ success: false, error: 'A specific reason is required to reject an entry.' });
    }
    const id = path.split('/')[2];
    const dist = mockStore.distributions.find(d => d._id === id);
    if (!dist) return res.status(404).json({ success: false, error: 'Distribution record not found.' });

    if (user.role === 'team_leader') {
      const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
      const dTeamId = dist.teamId ? (dist.teamId._id || dist.teamId) : null;
      if (uTeamId !== dTeamId) {
        return res.status(403).json({ success: false, error: 'You are only authorized to review and reject entries for your own team.' });
      }
    }

    dist.approvalStatus = 'rejected';
    dist.status = 'rejected';
    dist.rejectionReason = req.body.reason.trim();
    dist.approvedBy = { fullName: user.fullName, role: user.role };
    dist.approvedAt = new Date().toISOString();
    return res.json({ success: true, message: 'Distribution entry rejected.', data: dist });
  }

  if (path.startsWith('/distributions/') && path.endsWith('/resubmit') && method === 'PUT') {
    const id = path.split('/')[2];
    const dist = mockStore.distributions.find(d => d._id === id);
    if (!dist) return res.status(404).json({ success: false, error: 'Distribution record not found.' });
    if (req.body.quantity) dist.quantity = parseInt(req.body.quantity, 10);
    if (req.body.notes !== undefined) dist.notes = req.body.notes;
    dist.approvalStatus = 'pending';
    dist.status = 'pending';
    dist.rejectionReason = '';
    return res.json({ success: true, message: 'Entry resubmitted for approval.', data: dist });
  }

  if (path === '/distributions' || path === '/distributions/') {
    if (method === 'GET') {
      const user = getUserFromToken();
      let list = mockStore.distributions;
      if (user.role === 'team_member') {
        list = list.filter(d => d.memberId && (d.memberId._id === user._id || d.memberId.fullName === user.fullName));
      } else if (user.role === 'team_leader') {
        const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
        list = list.filter(d => {
          const dTeamId = d.teamId ? (d.teamId._id || d.teamId) : null;
          return uTeamId && dTeamId ? uTeamId === dTeamId : true;
        });
      }
      if (req.query.approvalStatus) {
        list = list.filter(d => d.approvalStatus === req.query.approvalStatus);
      }
      return res.json({
        success: true,
        data: {
          distributions: list,
          pagination: { total: list.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const user = getUserFromToken();
      const isAuto = ['super_admin', 'usthad'].includes(user.role);
      const initialStatus = isAuto ? 'approved' : 'pending';
      const userTeam = user.teamId || mockStore.teams[0];
      const newDist = {
        _id: '65f0000000000000000000' + (mockStore.distributions.length + 55),
        quantity: parseInt(req.body.quantity, 10) || 1,
        date: req.body.date || new Date().toISOString(),
        memberId: { _id: user._id, fullName: user.fullName, phone: user.phone },
        teamId: { _id: userTeam._id || userTeam, name: userTeam.name || 'Al-Huda Team' },
        areaId: { name: req.body.areaName || 'Downtown Commercial', district: 'Central' },
        recipientName: req.body.recipientName || 'General Recipient',
        notes: req.body.notes || '',
        status: initialStatus,
        approvalStatus: initialStatus,
        approvedBy: isAuto ? { fullName: user.fullName, role: user.role } : null,
        approvedAt: isAuto ? new Date().toISOString() : null
      };
      mockStore.distributions.unshift(newDist);
      return res.status(201).json({ success: true, data: newDist });
    }
  }

  // Collections: /api/collections/*
  if (path.startsWith('/collections/') && path.endsWith('/approve') && method === 'PUT') {
    const user = getUserFromToken();
    if (user.role === 'team_member') {
      return res.status(403).json({ success: false, error: 'Team members are not authorized to approve entries.' });
    }
    const id = path.split('/')[2];
    const col = mockStore.collections.find(c => c._id === id);
    if (!col) return res.status(404).json({ success: false, error: 'Collection record not found.' });

    if (user.role === 'team_leader') {
      const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
      const cTeamId = col.teamId ? (col.teamId._id || col.teamId) : null;
      if (uTeamId !== cTeamId) {
        return res.status(403).json({ success: false, error: 'You are only authorized to review and approve entries for your own team.' });
      }
    }

    col.approvalStatus = 'approved';
    col.status = 'approved';
    col.approvedBy = { fullName: user.fullName, role: user.role };
    col.approvedAt = new Date().toISOString();
    col.rejectionReason = '';
    return res.json({ success: true, message: 'Collection entry approved successfully.', data: col });
  }

  if (path.startsWith('/collections/') && path.endsWith('/reject') && method === 'PUT') {
    const user = getUserFromToken();
    if (user.role === 'team_member') {
      return res.status(403).json({ success: false, error: 'Team members are not authorized to reject entries.' });
    }
    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(400).json({ success: false, error: 'A specific reason is required to reject an entry.' });
    }
    const id = path.split('/')[2];
    const col = mockStore.collections.find(c => c._id === id);
    if (!col) return res.status(404).json({ success: false, error: 'Collection record not found.' });

    if (user.role === 'team_leader') {
      const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
      const cTeamId = col.teamId ? (col.teamId._id || col.teamId) : null;
      if (uTeamId !== cTeamId) {
        return res.status(403).json({ success: false, error: 'You are only authorized to review and reject entries for your own team.' });
      }
    }

    col.approvalStatus = 'rejected';
    col.status = 'rejected';
    col.rejectionReason = req.body.reason.trim();
    col.approvedBy = { fullName: user.fullName, role: user.role };
    col.approvedAt = new Date().toISOString();
    return res.json({ success: true, message: 'Collection entry rejected.', data: col });
  }

  if (path.startsWith('/collections/') && path.endsWith('/resubmit') && method === 'PUT') {
    const id = path.split('/')[2];
    const col = mockStore.collections.find(c => c._id === id);
    if (!col) return res.status(404).json({ success: false, error: 'Collection record not found.' });
    if (req.body.amount !== undefined) col.amount = parseFloat(req.body.amount);
    if (req.body.notes !== undefined) col.notes = req.body.notes;
    col.approvalStatus = 'pending';
    col.status = 'pending';
    col.rejectionReason = '';
    return res.json({ success: true, message: 'Collection resubmitted for approval.', data: col });
  }

  if (path === '/collections' || path === '/collections/') {
    if (method === 'GET') {
      const user = getUserFromToken();
      let list = mockStore.collections;
      if (user.role === 'team_member') {
        list = list.filter(c => c.memberId && (c.memberId._id === user._id || c.memberId.fullName === user.fullName));
      } else if (user.role === 'team_leader') {
        const uTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
        list = list.filter(c => {
          const cTeamId = c.teamId ? (c.teamId._id || c.teamId) : null;
          return uTeamId && cTeamId ? uTeamId === cTeamId : true;
        });
      }
      if (req.query.approvalStatus) {
        list = list.filter(c => c.approvalStatus === req.query.approvalStatus);
      }
      return res.json({
        success: true,
        data: {
          collections: list,
          pagination: { total: list.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const user = getUserFromToken();
      const isAuto = ['super_admin', 'usthad'].includes(user.role);
      const initialStatus = isAuto ? 'approved' : 'pending';
      const userTeam = user.teamId || mockStore.teams[0];
      const newCol = {
        _id: '65f0000000000000000000' + (mockStore.collections.length + 65),
        amount: parseFloat(req.body.amount) || 100,
        date: req.body.date || new Date().toISOString(),
        memberId: { _id: user._id, fullName: user.fullName, phone: user.phone },
        teamId: { _id: userTeam._id || userTeam, name: userTeam.name || 'Al-Huda Team' },
        areaId: { name: req.body.areaName || 'Downtown Commercial', district: 'Central' },
        collectedFrom: req.body.collectedFrom || 'Donor / Buyer',
        notes: req.body.notes || '',
        status: initialStatus,
        approvalStatus: initialStatus,
        approvedBy: isAuto ? { fullName: user.fullName, role: user.role } : null,
        approvedAt: isAuto ? new Date().toISOString() : null
      };
      mockStore.collections.unshift(newCol);
      return res.status(201).json({ success: true, data: newCol });
    }
  }

  // Transfers: /api/transfers/*
  if (path === '/transfers' || path === '/transfers/') {
    if (method === 'GET') {
      return res.json({
        success: true,
        data: {
          transfers: mockStore.transfers,
          pagination: { total: mockStore.transfers.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const newTr = {
        _id: '65f0000000000000000000' + (mockStore.transfers.length + 75),
        amount: parseFloat(req.body.amount) || 500,
        transferDate: req.body.transferDate || new Date().toISOString(),
        fromUserId: { fullName: 'Super Admin', phone: '9876543210', role: 'super_admin' },
        teamId: { name: 'Al-Huda Team' },
        paymentMethod: req.body.paymentMethod || 'cash',
        status: 'pending'
      };
      mockStore.transfers.unshift(newTr);
      return res.status(201).json({ success: true, data: newTr });
    }
  }

  if (path.startsWith('/transfers/') && path.endsWith('/confirm') && method === 'PUT') {
    const id = path.split('/')[2];
    const tr = mockStore.transfers.find(t => t._id === id);
    if (tr) tr.status = 'confirmed';
    return res.json({ success: true, message: 'Transfer confirmed successfully.' });
  }

  // Expenses: /api/expenses/*
  if (path === '/expenses' || path === '/expenses/') {
    if (method === 'GET') {
      return res.json({
        success: true,
        data: {
          expenses: mockStore.expenses,
          pagination: { total: mockStore.expenses.length, page: 1, limit: 50, pages: 1 }
        }
      });
    }
    if (method === 'POST') {
      const newExp = {
        _id: '65f0000000000000000000' + (mockStore.expenses.length + 85),
        category: req.body.category || 'other',
        description: req.body.description || 'Miscellaneous Expense',
        amount: parseFloat(req.body.amount) || 0,
        date: req.body.date || new Date().toISOString(),
        createdBy: { fullName: 'Super Admin' }
      };
      mockStore.expenses.unshift(newExp);
      return res.status(201).json({ success: true, data: newExp });
    }
  }

  // Reports: /api/reports/whatsapp-summary
  if (path === '/reports/whatsapp-summary' || path.startsWith('/reports/whatsapp-summary')) {
    const {
      reportType,
      reportFormat = 'daily',
      date,
      breakdown = 'team',
      teamId,
      areaId,
      offlineCount = 0,
      sections: rawSections,
      customFooterNote
    } = req.query;

    const activeReportType = reportType || reportFormat || 'daily';

    let parsedSections = {
      includeHeader: true,
      includeSummary: true,
      includeLeaderboard: true,
      includeBreakdown: true,
      includeTopPerformers: true,
      includeHandoverStatus: true,
      includeProgressBar: true,
      includeZeroActivity: false,
      includeOfflineNotice: true,
      includeFooter: true
    };

    if (typeof rawSections === 'string') {
      try {
        parsedSections = { ...parsedSections, ...JSON.parse(rawSections) };
      } catch {}
    } else if (rawSections && typeof rawSections === 'object') {
      parsedSections = { ...parsedSections, ...rawSections };
    }

    [
      'includeHeader',
      'includeSummary',
      'includeLeaderboard',
      'includeBreakdown',
      'includeTopPerformers',
      'includeHandoverStatus',
      'includeProgressBar',
      'includeZeroActivity',
      'includeOfflineNotice',
      'includeFooter'
    ].forEach((k) => {
      if (req.query[k] !== undefined) {
        parsedSections[k] = req.query[k] === 'true' || req.query[k] === true;
      }
    });

    const user = getUserFromToken();
    const d = date ? new Date(date) : new Date();
    const displayDateStr = activeReportType === 'daily'
      ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const isTeamLeader = user.role === 'team_leader';
    const isTeamMember = user.role === 'team_member';
    let scopedTeamId = null;

    if (isTeamMember || isTeamLeader) {
      // Strictly enforce team leader and member scope to their own team only
      scopedTeamId = user.teamId ? (user.teamId._id || user.teamId) : mockStore.teams[0]._id;
    } else if (teamId) {
      scopedTeamId = teamId;
    }

    let relevantTeams = mockStore.teams;
    if (scopedTeamId) {
      relevantTeams = mockStore.teams.filter(t => t._id === scopedTeamId);
      if (relevantTeams.length === 0) relevantTeams = [mockStore.teams[0]];
    }

    let scopeTitle = scopedTeamId
      ? `Team: ${relevantTeams[0].name}`
      : 'Campaign-Wide (All Teams)';

    // Build structured teamsData excluding unapproved entries
    const teamsData = relevantTeams.map(t => {
      const teamUsers = mockStore.users.filter(u => u.teamId && (u.teamId._id === t._id || u.teamId === t._id));
      const members = teamUsers.map(u => {
        const approvedDists = mockStore.distributions.filter(d =>
          (d.memberId && (d.memberId._id === u._id || d.memberId.fullName === u.fullName)) &&
          (d.approvalStatus === 'approved' || d.status === 'approved')
        );
        const approvedCols = mockStore.collections.filter(c =>
          (c.memberId && (c.memberId._id === u._id || c.memberId.fullName === u.fullName)) &&
          (c.approvalStatus === 'approved' || c.status === 'approved')
        );
        return {
          id: u._id,
          name: u.fullName,
          distributed: approvedDists.reduce((s, x) => s + (x.quantity || 0), 0),
          collected: approvedCols.reduce((s, x) => s + (x.amount || 0), 0)
        };
      });

      const teamDist = members.reduce((s, m) => s + m.distributed, 0);
      const teamCol = members.reduce((s, m) => s + m.collected, 0);

      return {
        id: t._id,
        name: t.name,
        distributed: teamDist,
        collected: teamCol,
        members
      };
    });

    const totalDistributed = teamsData.reduce((s, t) => s + t.distributed, 0);
    const totalCollected = teamsData.reduce((s, t) => s + t.collected, 0);
    const totalTransferred = Math.round(totalCollected * 0.8);

    const generatedText = buildCustomWhatsAppReport({
      reportType: activeReportType,
      dateStr: displayDateStr,
      scopeTitle,
      role: user.role,
      campaignConfig: mockStore.campaign,
      teamsData,
      totals: {
        distributed: totalDistributed,
        collected: totalCollected,
        transferred: totalTransferred,
        teamsCount: mockStore.teams.length,
        membersCount: mockStore.users.length,
        areasCount: mockStore.areas.length
      },
      offlinePendingCount: parseInt(offlineCount, 10) || 0,
      sections: parsedSections,
      customFooterNote: customFooterNote || ''
    });

    return res.json({
      success: true,
      text: generatedText,
      metadata: {
        reportType: activeReportType,
        displayDate: displayDateStr,
        scopeTitle,
        totals: {
          distributed: totalDistributed,
          collected: totalCollected,
          transferred: totalTransferred
        },
        sections: parsedSections,
        teamCount: teamsData.length
      }
    });
  }

  // Reports: /api/reports/*
  if (path.startsWith('/reports/')) {
    return res.json({
      success: true,
      data: mockStore.distributions
    });
  }

  // Sync: /api/sync/*
  if (path.startsWith('/sync')) {
    return res.json({
      success: true,
      message: 'Offline sync processed',
      data: { syncedCount: 0 }
    });
  }

  // Default fallback for any remaining GET requests
  if (method === 'GET') {
    return res.json({ success: true, data: path.endsWith('s') || path.endsWith('s/') ? [] : {} });
  }

  // For any write operations
  return res.json({ success: true, message: 'Operation recorded in offline session.' });
}
