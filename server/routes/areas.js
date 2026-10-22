import express from 'express';
import Area from '../models/Area.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/areas - Search and list areas with distribution/collection aggregates
router.get('/', async (req, res) => {
  try {
    const { search, includeMerged = 'false' } = req.query;
    const query = {};

    if (includeMerged !== 'true') {
      query.mergedIntoId = null;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { district: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const areas = await Area.find(query).sort({ name: 1 }).limit(100);

    const areasWithStats = await Promise.all(
      areas.map(async (a) => {
        const [distAgg, colAgg] = await Promise.all([
          Distribution.aggregate([
            { $match: { areaId: a._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { areaId: a._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);

        return {
          _id: a._id,
          name: a.name,
          district: a.district,
          aliases: a.aliases || [],
          mergedIntoId: a.mergedIntoId,
          createdAt: a.createdAt,
          totalDistributed: distAgg[0] ? distAgg[0].total : 0,
          totalCollected: colAgg[0] ? colAgg[0].total : 0
        };
      })
    );

    return res.json({ success: true, data: areasWithStats });
  } catch (err) {
    console.error('List areas error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch areas.' });
  }
});

// POST /api/areas - Add new area (Any authenticated participant)
router.post('/', async (req, res) => {
  try {
    const { name, district = 'Palakkad' } = req.body;
    const check = validateRequired(req.body, ['name']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }

    const cleanName = name.trim();
    const normalizedName = cleanName.toLowerCase().replace(/\s+/g, ' ');

    // Check if duplicate or closely matching area already exists
    const existing = await Area.findOne({
      normalizedName,
      mergedIntoId: null
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        data: existing,
        existing: true,
        message: 'Existing matching area selected.'
      });
    }

    const area = await Area.create({
      name: cleanName,
      district: district.trim(),
      normalizedName,
      createdBy: req.user._id
    });

    await logAudit({
      entityType: 'area',
      entityId: area._id,
      action: 'create',
      newValues: { name: area.name, district: area.district },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.status(201).json({ success: true, data: area });
  } catch (err) {
    console.error('Create area error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add area.' });
  }
});

// POST /api/areas/merge - Merge duplicate areas (Super Admin only)
router.post('/merge', requireRole('super_admin'), async (req, res) => {
  try {
    const { sourceAreaId, targetAreaId } = req.body;

    if (!isValidObjectId(sourceAreaId) || !isValidObjectId(targetAreaId)) {
      return res.status(400).json({ success: false, error: 'Valid source and target area IDs are required.' });
    }

    if (sourceAreaId === targetAreaId) {
      return res.status(400).json({ success: false, error: 'Source and target cannot be the same area.' });
    }

    const [source, target] = await Promise.all([
      Area.findById(sourceAreaId),
      Area.findById(targetAreaId)
    ]);

    if (!source || !target) {
      return res.status(404).json({ success: false, error: 'Source or target area not found.' });
    }

    // Re-point all distributions and collections
    const [distUpdate, colUpdate] = await Promise.all([
      Distribution.updateMany({ areaId: sourceAreaId }, { areaId: targetAreaId }),
      Collection.updateMany({ areaId: sourceAreaId }, { areaId: targetAreaId })
    ]);

    // Mark source area as merged
    source.mergedIntoId = targetAreaId;
    await source.save();

    await logAudit({
      entityType: 'area',
      entityId: target._id,
      action: 'merge',
      oldValues: { mergedSource: sourceAreaId, sourceName: source.name },
      newValues: {
        targetName: target.name,
        distributionsReassigned: distUpdate.modifiedCount,
        collectionsReassigned: colUpdate.modifiedCount
      },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Successfully merged "${source.name}" into "${target.name}". Updated ${distUpdate.modifiedCount} distributions and ${colUpdate.modifiedCount} collections.`,
      data: target
    });
  } catch (err) {
    console.error('Merge areas error:', err);
    return res.status(500).json({ success: false, error: 'Failed to merge areas.' });
  }
});

// GET /api/areas/duplicates - Detect duplicate or similar area names
router.get('/duplicates', async (req, res) => {
  try {
    const areas = await Area.find({ mergedIntoId: null }).select('name district normalizedName aliases');
    const duplicatePairs = [];

    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const a1 = areas[i];
        const a2 = areas[j];

        const n1 = a1.normalizedName;
        const n2 = a2.normalizedName;

        // Exact normalized match or substring containment
        const isMatch = n1 === n2 ||
          (n1.length > 4 && n2.includes(n1)) ||
          (n2.length > 4 && n1.includes(n2));

        if (isMatch) {
          duplicatePairs.push({
            primary: a1,
            duplicate: a2,
            reason: n1 === n2 ? 'Identical normalized spelling' : 'High text similarity'
          });
        }
      }
    }

    return res.json({ success: true, count: duplicatePairs.length, data: duplicatePairs });
  } catch (err) {
    console.error('Duplicate detection error:', err);
    return res.status(500).json({ success: false, error: 'Failed to detect duplicate areas.' });
  }
});

// POST /api/areas/:id/aliases - Add alternate name / alias to an area
router.post('/:id/aliases', async (req, res) => {
  try {
    const { id } = req.params;
    const { alias } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid area ID.' });
    }

    if (!alias || typeof alias !== 'string' || !alias.trim()) {
      return res.status(400).json({ success: false, error: 'Valid alias string is required.' });
    }

    const cleanAlias = alias.trim();
    const area = await Area.findById(id);
    if (!area) {
      return res.status(404).json({ success: false, error: 'Area not found.' });
    }

    if (!area.aliases) area.aliases = [];
    if (!area.aliases.includes(cleanAlias)) {
      area.aliases.push(cleanAlias);
      await area.save();

      await logAudit({
        entityType: 'area',
        entityId: area._id,
        action: 'add_alias',
        newValues: { alias: cleanAlias, allAliases: area.aliases },
        performedBy: req.user._id,
        ipAddress: req.ip
      });
    }

    return res.json({ success: true, message: `Alias "${cleanAlias}" added.`, data: area });
  } catch (err) {
    console.error('Add alias error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add alias.' });
  }
});

export default router;
