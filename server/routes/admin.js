import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Team from '../models/Team.js';
import Area from '../models/Area.js';
import CampaignConfig from '../models/CampaignConfig.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import StockAllocation from '../models/StockAllocation.js';
import Expense from '../models/Expense.js';
import Correction from '../models/Correction.js';
import AuditLog from '../models/AuditLog.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { logAudit } from '../utils/audit.js';
import { resetMockStore } from '../middleware/mockData.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin'));

// GET /api/admin/system-stats - Overview of database record counts
router.get('/system-stats', async (req, res) => {
  try {
    const [
      usersCount,
      teamsCount,
      areasCount,
      distributionsCount,
      collectionsCount,
      transfersCount,
      expensesCount,
      correctionsCount
    ] = await Promise.all([
      User.countDocuments(),
      Team.countDocuments(),
      Area.countDocuments(),
      Distribution.countDocuments(),
      Collection.countDocuments(),
      MoneyTransfer.countDocuments(),
      Expense.countDocuments(),
      Correction.countDocuments()
    ]);

    return res.json({
      success: true,
      data: {
        users: usersCount,
        teams: teamsCount,
        areas: areasCount,
        distributions: distributionsCount,
        collections: collectionsCount,
        transfers: transfersCount,
        expenses: expensesCount,
        corrections: correctionsCount
      }
    });
  } catch (err) {
    console.error('System stats error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch system stats.' });
  }
});

// POST /api/admin/reset-data - Reset entire app data to clean slate or sandbox demo
router.post('/reset-data', async (req, res) => {
  try {
    const { mode = 'clean', confirmText } = req.body;

    if (confirmText !== 'RESET') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation failed: You must type "RESET" to confirm wiping the database.'
      });
    }

    const isSandbox = mode === 'sandbox';

    // 1. Wipe transactional records and non-admin entities
    await Promise.all([
      Distribution.deleteMany({}),
      Collection.deleteMany({}),
      MoneyTransfer.deleteMany({}),
      Expense.deleteMany({}),
      Correction.deleteMany({}),
      StockAllocation.deleteMany({}),
      AuditLog.deleteMany({}),
      Area.deleteMany({}),
      Team.deleteMany({}),
      CampaignConfig.deleteMany({}),
      User.deleteMany({ role: { $ne: 'super_admin' } })
    ]);

    // 2. Re-create default Campaign Configuration
    const campaignConfig = await CampaignConfig.create({
      totalStock: 5000,
      calendarPrice: 100,
      initialInvestment: 20000,
      printingCost: 50000,
      campaignYear: new Date().getFullYear(),
      notes: 'Markazul Hidayathil Islamiyya Calendar Campaign'
    });

    // 3. Re-create standard Camp Teams
    const [teamHuda, teamNoor, teamFarooq, teamBayan] = await Promise.all([
      Team.create({
        name: 'Al-Huda Team',
        description: 'Central District Team',
        isActive: true,
        leaderEntersOverallCollection: false,
        overallCollectedAmount: 0
      }),
      Team.create({
        name: 'Al-Noor Team',
        description: 'North Zone Team',
        isActive: true,
        leaderEntersOverallCollection: false,
        overallCollectedAmount: 0
      }),
      Team.create({
        name: 'Al-Farooq Team',
        description: 'South Zone Team',
        isActive: true,
        leaderEntersOverallCollection: false,
        overallCollectedAmount: 0
      }),
      Team.create({
        name: 'Al-Bayan Team',
        description: 'East Zone Team',
        isActive: true,
        leaderEntersOverallCollection: false,
        overallCollectedAmount: 0
      })
    ]);

    // 4. Re-create standard Areas
    const [areaCommercial, areaMarket, areaNorth, areaCoast] = await Promise.all([
      Area.create({ name: 'Downtown Commercial', district: 'Central', normalizedName: 'downtown commercial', createdBy: req.user._id }),
      Area.create({ name: 'Market Junction', district: 'Central', normalizedName: 'market junction', createdBy: req.user._id }),
      Area.create({ name: 'North Town', district: 'North', normalizedName: 'north town', createdBy: req.user._id }),
      Area.create({ name: 'Coastal Belt', district: 'South', normalizedName: 'coastal belt', createdBy: req.user._id })
    ]);

    // 5. Hash passwords and create default core accounts
    const [adminPassHash, usthadPassHash, leaderPassHash, memberPassHash] = await Promise.all([
      bcrypt.hash('admin123', 10),
      bcrypt.hash('usthad123', 10),
      bcrypt.hash('leader123', 10),
      bcrypt.hash('member123', 10)
    ]);

    const [adminPinHash, usthadPinHash, leaderPinHash, memberPinHash] = await Promise.all([
      bcrypt.hash('7863', 10),
      bcrypt.hash('2222', 10),
      bcrypt.hash('3333', 10),
      bcrypt.hash('4444', 10)
    ]);

    // Update active admin record so session remains continuous
    const adminUser = await User.findOneAndUpdate(
      { username: 'admin' },
      {
        username: 'admin',
        passwordHash: adminPassHash,
        pinHash: adminPinHash,
        passwordHint: 'admin123',
        pinHint: '7863',
        fullName: 'Super Admin',
        phone: '9876543210',
        role: 'super_admin',
        teamId: null,
        isActive: true,
        mustChangePassword: false
      },
      { upsert: true, new: true }
    );

    const [usthadUser, leader1User, member1User] = await Promise.all([
      User.findOneAndUpdate(
        { username: 'usthad' },
        {
          username: 'usthad',
          passwordHash: usthadPassHash,
          pinHash: usthadPinHash,
          passwordHint: 'usthad123',
          pinHint: '2222',
          fullName: 'Usthad Abdullah',
          phone: '9876543211',
          role: 'usthad',
          teamId: null,
          isActive: true
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { username: 'leader1' },
        {
          username: 'leader1',
          passwordHash: leaderPassHash,
          pinHash: leaderPinHash,
          passwordHint: 'leader123',
          pinHint: '3333',
          fullName: 'Ahmed Bilal',
          phone: '9876543212',
          role: 'team_leader',
          teamId: teamHuda._id,
          isActive: true
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { username: 'member1' },
        {
          username: 'member1',
          passwordHash: memberPassHash,
          pinHash: memberPinHash,
          passwordHint: 'member123',
          pinHint: '4444',
          fullName: 'Zaid Rahman',
          phone: '9876543213',
          role: 'team_member',
          teamId: teamHuda._id,
          isActive: true
        },
        { upsert: true, new: true }
      )
    ]);

    // 6. If SANDBOX MODE requested, seed realistic scenario data
    if (isSandbox) {
      const extraPassHash = await bcrypt.hash('member123', 10);
      const extraPinHash = await bcrypt.hash('5555', 10);

      // Create extra sandbox members & leaders
      const [member2User, leader2User, member3User] = await Promise.all([
        User.findOneAndUpdate(
          { username: 'member2' },
          {
            username: 'member2',
            passwordHash: extraPassHash,
            pinHash: extraPinHash,
            passwordHint: 'member123',
            pinHint: '5555',
            fullName: 'Salman Faris',
            phone: '9876543214',
            role: 'team_member',
            teamId: teamHuda._id,
            isActive: true
          },
          { upsert: true, new: true }
        ),
        User.findOneAndUpdate(
          { username: 'leader2' },
          {
            username: 'leader2',
            passwordHash: leaderPassHash,
            pinHash: await bcrypt.hash('3334', 10),
            passwordHint: 'leader123',
            pinHint: '3334',
            fullName: 'Hassan Ali',
            phone: '9876543215',
            role: 'team_leader',
            teamId: teamNoor._id,
            isActive: true
          },
          { upsert: true, new: true }
        ),
        User.findOneAndUpdate(
          { username: 'member3' },
          {
            username: 'member3',
            passwordHash: extraPassHash,
            pinHash: await bcrypt.hash('4445', 10),
            passwordHint: 'member123',
            pinHint: '4445',
            fullName: 'Umar Farooq',
            phone: '9876543216',
            role: 'team_member',
            teamId: teamNoor._id,
            isActive: true
          },
          { upsert: true, new: true }
        )
      ]);

      // Stock allocations to teams
      await Promise.all([
        StockAllocation.create({ teamId: teamHuda._id, memberId: null, quantity: 800, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamNoor._id, memberId: null, quantity: 600, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamFarooq._id, memberId: null, quantity: 400, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamBayan._id, memberId: null, quantity: 300, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamHuda._id, memberId: member1User._id, quantity: 250, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamHuda._id, memberId: member2User._id, quantity: 200, allocatedBy: adminUser._id }),
        StockAllocation.create({ teamId: teamNoor._id, memberId: member3User._id, quantity: 200, allocatedBy: adminUser._id })
      ]);

      // Realistic distributions
      const dist1 = await Distribution.create({
        memberId: member1User._id,
        teamId: teamHuda._id,
        areaId: areaCommercial._id,
        quantity: 50,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        notes: 'City Center Traders',
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: adminUser._id,
        approvedAt: new Date(),
        createdBy: member1User._id
      });

      const dist2 = await Distribution.create({
        memberId: member2User._id,
        teamId: teamHuda._id,
        areaId: areaMarket._id,
        quantity: 30,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        notes: 'West Market Shops',
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: adminUser._id,
        approvedAt: new Date(),
        createdBy: member2User._id
      });

      // Realistic collections
      await Promise.all([
        Collection.create({
          memberId: member1User._id,
          teamId: teamHuda._id,
          areaId: areaCommercial._id,
          amount: 5000,
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          notes: 'Shop collections from City Center',
          relatedDistributionId: dist1._id,
          createdBy: member1User._id,
          status: 'approved',
          approvalStatus: 'approved',
          approvedBy: adminUser._id,
          approvedAt: new Date()
        }),
        Collection.create({
          memberId: member2User._id,
          teamId: teamHuda._id,
          areaId: areaMarket._id,
          amount: 3000,
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          notes: 'Commercial sponsorship donation',
          incomeType: 'donation',
          createdBy: member2User._id,
          status: 'approved',
          approvalStatus: 'approved',
          approvedBy: adminUser._id,
          approvedAt: new Date()
        }),
        Collection.create({
          memberId: member1User._id,
          teamId: teamHuda._id,
          areaId: areaCommercial._id,
          amount: 1500,
          date: new Date(),
          notes: 'Pending review collection from trade union',
          createdBy: member1User._id,
          status: 'pending',
          approvalStatus: 'pending'
        })
      ]);

      // Money transfers
      await Promise.all([
        MoneyTransfer.create({
          fromUserId: member1User._id,
          toDescription: 'Transferred to Team Leader (Ahmed Bilal)',
          teamId: teamHuda._id,
          amount: 4000,
          notes: 'Cash transfer handed over at camp office',
          transferDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          status: 'confirmed',
          confirmedBy: leader1User._id,
          confirmedAt: new Date()
        }),
        MoneyTransfer.create({
          fromUserId: member2User._id,
          toDescription: 'Transferred to Usthad Abdullah via GPay',
          teamId: teamHuda._id,
          amount: 2500,
          notes: 'Ref: UPI8892119024',
          transferDate: new Date(),
          status: 'pending'
        })
      ]);

      // Sample printing expense
      await Expense.create({
        category: 'printing',
        amount: 25000,
        description: 'First batch calendar printing advance to Graphic Press',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        receiptNumber: 'INV-PRINT-101',
        createdBy: adminUser._id
      });
    }

    // Reset fallback mock store as well
    if (typeof resetMockStore === 'function') {
      resetMockStore(isSandbox ? 'sandbox' : 'clean');
    }

    await logAudit({
      entityType: 'system',
      entityId: adminUser._id,
      action: 'reset_data',
      newValues: { mode: isSandbox ? 'sandbox' : 'clean' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('system:data_reset', { mode: isSandbox ? 'sandbox' : 'clean', timestamp: new Date() });
    }

    return res.json({
      success: true,
      message: isSandbox
        ? 'Sandbox initialized successfully! Demo teams, distributions, collections and transfers are loaded.'
        : 'App data wiped and reset to clean production state! Core teams, campaign config, and default credentials are ready.',
      mode: isSandbox ? 'sandbox' : 'clean'
    });
  } catch (err) {
    console.error('Reset app data error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to reset application data.' });
  }
});

export default router;
