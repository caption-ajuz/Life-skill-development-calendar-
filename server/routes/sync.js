import express from 'express';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import Area from '../models/Area.js';
import StockAllocation from '../models/StockAllocation.js';
import { authMiddleware } from '../middleware/auth.js';
import { isValidObjectId } from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

// POST /api/sync/push - Batch push offline queued entries
router.post('/push', async (req, res) => {
  try {
    const { distributions = [], collections = [], transfers = [], areas = [] } = req.body;

    const results = {
      distributions: { synced: [], duplicates: [], errors: [] },
      collections: { synced: [], duplicates: [], errors: [] },
      transfers: { synced: [], duplicates: [], errors: [] },
      areas: { synced: [], duplicates: [], errors: [] }
    };

    const teamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;

    // 1. Process offline Areas
    for (const item of areas) {
      try {
        if (!item.name || !item.name.trim()) continue;
        const normalized = item.name.toLowerCase().trim().replace(/\s+/g, ' ');
        let existing = await Area.findOne({ normalizedName: normalized, mergedIntoId: null });
        if (!existing) {
          existing = await Area.create({
            name: item.name.trim(),
            district: item.district ? item.district.trim() : 'Palakkad',
            normalizedName: normalized,
            createdBy: req.user._id
          });
        }
        results.areas.synced.push({ clientId: item.clientId || existing._id.toString(), serverId: existing._id });
      } catch (e) {
        results.areas.errors.push({ clientId: item.clientId, error: e.message });
      }
    }

    // 2. Process offline Distributions
    for (const item of distributions) {
      try {
        if (item.clientId) {
          const existing = await Distribution.findOne({ clientId: item.clientId });
          if (existing) {
            results.distributions.duplicates.push({ clientId: item.clientId, serverId: existing._id });
            continue;
          }
        }

        const qty = parseInt(item.quantity, 10);
        if (isNaN(qty) || qty < 1) {
          results.distributions.errors.push({ clientId: item.clientId, error: 'Invalid quantity' });
          continue;
        }

        const dist = await Distribution.create({
          memberId: req.user._id,
          teamId,
          areaId: item.areaId && isValidObjectId(item.areaId) ? item.areaId : null,
          quantity: qty,
          date: item.date ? new Date(item.date) : new Date(),
          notes: item.notes || '',
          clientId: item.clientId || undefined,
          createdBy: req.user._id,
          status: 'active'
        });

        results.distributions.synced.push({ clientId: item.clientId || dist._id.toString(), serverId: dist._id });
      } catch (e) {
        if (e.code === 11000) {
          results.distributions.duplicates.push({ clientId: item.clientId });
        } else {
          results.distributions.errors.push({ clientId: item.clientId, error: e.message });
        }
      }
    }

    // 3. Process offline Collections
    for (const item of collections) {
      try {
        if (item.clientId) {
          const existing = await Collection.findOne({ clientId: item.clientId });
          if (existing) {
            results.collections.duplicates.push({ clientId: item.clientId, serverId: existing._id });
            continue;
          }
        }

        const amt = parseFloat(item.amount);
        if (isNaN(amt) || amt < 0) {
          results.collections.errors.push({ clientId: item.clientId, error: 'Invalid amount' });
          continue;
        }

        const col = await Collection.create({
          memberId: req.user._id,
          teamId,
          areaId: item.areaId && isValidObjectId(item.areaId) ? item.areaId : null,
          amount: amt,
          date: item.date ? new Date(item.date) : new Date(),
          notes: item.notes || '',
          clientId: item.clientId || undefined,
          createdBy: req.user._id,
          status: 'active'
        });

        results.collections.synced.push({ clientId: item.clientId || col._id.toString(), serverId: col._id });
      } catch (e) {
        if (e.code === 11000) {
          results.collections.duplicates.push({ clientId: item.clientId });
        } else {
          results.collections.errors.push({ clientId: item.clientId, error: e.message });
        }
      }
    }

    // 4. Process offline Transfers
    for (const item of transfers) {
      try {
        if (item.clientId) {
          const existing = await MoneyTransfer.findOne({ clientId: item.clientId });
          if (existing) {
            results.transfers.duplicates.push({ clientId: item.clientId, serverId: existing._id });
            continue;
          }
        }

        const amt = parseFloat(item.amount);
        if (isNaN(amt) || amt <= 0 || !item.toDescription) {
          results.transfers.errors.push({ clientId: item.clientId, error: 'Invalid transfer details' });
          continue;
        }

        const trans = await MoneyTransfer.create({
          fromUserId: req.user._id,
          toDescription: item.toDescription.trim(),
          teamId,
          amount: amt,
          transferDate: item.transferDate ? new Date(item.transferDate) : new Date(),
          status: 'awaiting_confirmation',
          notes: item.notes || '',
          clientId: item.clientId || undefined
        });

        results.transfers.synced.push({ clientId: item.clientId || trans._id.toString(), serverId: trans._id });
      } catch (e) {
        if (e.code === 11000) {
          results.transfers.duplicates.push({ clientId: item.clientId });
        } else {
          results.transfers.errors.push({ clientId: item.clientId, error: e.message });
        }
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('dashboard:refresh', { trigger: 'sync_push', userId: req.user._id });

    return res.json({ success: true, results });
  } catch (err) {
    console.error('Sync push error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process sync push.' });
  }
});

// GET /api/sync/pull - Pull incremental changes
router.get('/pull', async (req, res) => {
  try {
    const { since } = req.query;
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const query = { updatedAt: { $gt: sinceDate } };
    const memberQuery = { ...query };

    if (req.user.role === 'team_member') {
      memberQuery.memberId = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      memberQuery.teamId = userTeamId;
    }

    const [distributions, collections, transfers, areas, allocations] = await Promise.all([
      Distribution.find(memberQuery).sort({ updatedAt: -1 }).limit(200),
      Collection.find(memberQuery).sort({ updatedAt: -1 }).limit(200),
      MoneyTransfer.find(req.user.role === 'team_member' ? { fromUserId: req.user._id, updatedAt: { $gt: sinceDate } } : query).sort({ updatedAt: -1 }).limit(100),
      Area.find({ updatedAt: { $gt: sinceDate }, mergedIntoId: null }).limit(200),
      StockAllocation.find(query).limit(100)
    ]);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        distributions,
        collections,
        transfers,
        areas,
        allocations
      }
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    return res.status(500).json({ success: false, error: 'Failed to pull sync updates.' });
  }
});

// POST /api/sync/resolve-conflict - Explicit offline conflict resolution
router.post('/resolve-conflict', async (req, res) => {
  try {
    const { entityType, entityId, resolution, resolvedData } = req.body;

    if (!entityType || !entityId || !resolution) {
      return res.status(400).json({ success: false, error: 'entityType, entityId, and resolution strategy are required.' });
    }

    if (!['use_client', 'use_server', 'manual'].includes(resolution)) {
      return res.status(400).json({ success: false, error: 'resolution must be use_client, use_server, or manual.' });
    }

    if (resolution === 'use_client' || resolution === 'manual') {
      if (entityType === 'distribution') {
        await Distribution.findByIdAndUpdate(entityId, resolvedData, { new: true });
      } else if (entityType === 'collection') {
        await Collection.findByIdAndUpdate(entityId, resolvedData, { new: true });
      } else if (entityType === 'transfer') {
        await MoneyTransfer.findByIdAndUpdate(entityId, resolvedData, { new: true });
      }
    }

    return res.json({
      success: true,
      message: `Conflict resolved using strategy: ${resolution}`,
      entityId,
      status: 'synced'
    });
  } catch (err) {
    console.error('Resolve conflict error:', err);
    return res.status(500).json({ success: false, error: 'Failed to resolve conflict.' });
  }
});

export default router;
