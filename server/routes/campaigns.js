import express from 'express';
import Campaign from '../models/Campaign.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';
import { getActiveCampaign } from '../utils/campaignHelper.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/campaigns - List all campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: campaigns });
  } catch (err) {
    console.error('List campaigns error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch campaigns.' });
  }
});

// GET /api/campaigns/active - Current active campaign
router.get('/active', async (req, res) => {
  try {
    const campaign = await getActiveCampaign();
    return res.json({ success: true, data: campaign });
  } catch (err) {
    console.error('Get active campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch active campaign.' });
  }
});

// POST /api/campaigns - Create a new campaign (Super Admin only)
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const {
      campaignCode,
      name,
      description,
      startDate,
      endDate,
      totalStock,
      calendarPrice,
      initialInvestment,
      printingCost,
      defaultMemberTarget
    } = req.body;

    const check = validateRequired(req.body, ['campaignCode', 'name']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }

    const cleanCode = campaignCode.trim().toUpperCase();
    const existing = await Campaign.findOne({ campaignCode: cleanCode });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `A campaign with code "${cleanCode}" already exists.`
      });
    }

    const campaign = await Campaign.create({
      campaignCode: cleanCode,
      name: name.trim(),
      description: description ? description.trim() : '',
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: 'upcoming',
      isActive: false,
      totalStock: Number(totalStock) >= 0 ? Number(totalStock) : 5000,
      calendarPrice: Number(calendarPrice) >= 0 ? Number(calendarPrice) : 100,
      initialInvestment: Number(initialInvestment) >= 0 ? Number(initialInvestment) : 20000,
      printingCost: Number(printingCost) >= 0 ? Number(printingCost) : 50000,
      defaultMemberTarget: Number(defaultMemberTarget) >= 0 ? Number(defaultMemberTarget) : 25000,
      createdBy: req.user._id
    });

    await logAudit({
      entityType: 'campaign',
      entityId: campaign._id,
      action: 'create_campaign',
      newValues: { campaignCode: campaign.campaignCode, name: campaign.name },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create campaign.' });
  }
});

// PUT /api/campaigns/:id/activate - Set campaign as active (Super Admin only)
router.put('/:id/activate', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID.' });
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    await Campaign.updateMany({ _id: { $ne: id } }, { $set: { isActive: false } });

    campaign.isActive = true;
    campaign.status = 'active';
    await campaign.save();

    await logAudit({
      entityType: 'campaign',
      entityId: campaign._id,
      action: 'activate_campaign',
      newValues: { campaignCode: campaign.campaignCode, isActive: true },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: campaign, message: `Campaign ${campaign.name} is now active.` });
  } catch (err) {
    console.error('Activate campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to activate campaign.' });
  }
});

// PUT /api/campaigns/:id - Update campaign parameters
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID.' });
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    const {
      name,
      description,
      startDate,
      endDate,
      status,
      totalStock,
      calendarPrice,
      initialInvestment,
      printingCost,
      defaultMemberTarget
    } = req.body;

    if (name) campaign.name = name.trim();
    if (description !== undefined) campaign.description = description.trim();
    if (startDate) campaign.startDate = new Date(startDate);
    if (endDate) campaign.endDate = new Date(endDate);
    if (status && ['upcoming', 'active', 'completed', 'archived'].includes(status)) {
      campaign.status = status;
    }
    if (totalStock !== undefined) campaign.totalStock = Math.max(0, Number(totalStock));
    if (calendarPrice !== undefined) campaign.calendarPrice = Math.max(0, Number(calendarPrice));
    if (initialInvestment !== undefined) campaign.initialInvestment = Math.max(0, Number(initialInvestment));
    if (printingCost !== undefined) campaign.printingCost = Math.max(0, Number(printingCost));
    if (defaultMemberTarget !== undefined) campaign.defaultMemberTarget = Math.max(0, Number(defaultMemberTarget));

    await campaign.save();

    await logAudit({
      entityType: 'campaign',
      entityId: campaign._id,
      action: 'update_campaign',
      newValues: { name: campaign.name, status: campaign.status },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update campaign.' });
  }
});

export default router;
