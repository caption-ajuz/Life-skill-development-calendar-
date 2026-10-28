import Campaign from '../models/Campaign.js';
import CampaignConfig from '../models/CampaignConfig.js';
import Team from '../models/Team.js';
import StockAllocation from '../models/StockAllocation.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import Expense from '../models/Expense.js';
import MoneyTransfer from '../models/MoneyTransfer.js';

let cachedActiveCampaign = null;

export async function getActiveCampaign() {
  try {
    let campaign = await Campaign.findOne({ isActive: true, status: 'active' });
    if (!campaign) {
      // Check if any campaign exists
      campaign = await Campaign.findOne({ status: 'active' });
    }
    if (!campaign) {
      campaign = await Campaign.findOne().sort({ createdAt: -1 });
    }

    if (!campaign) {
      // Read legacy config if available
      const legacyCfg = await CampaignConfig.findOne();
      const currentYear = new Date().getFullYear();

      campaign = await Campaign.create({
        campaignCode: `CAMP-${currentYear}`,
        name: `Life Skill Course — Calendar Camp ${currentYear}`,
        description: 'Annual Calendar Camp Management for Markazul Hidayathil Islamiyya',
        startDate: new Date(`${currentYear}-01-01`),
        endDate: new Date(`${currentYear}-12-31`),
        status: 'active',
        isActive: true,
        totalStock: legacyCfg?.totalStock || 5000,
        calendarPrice: legacyCfg?.calendarPrice || 100,
        initialInvestment: legacyCfg?.initialInvestment || 20000,
        printingCost: legacyCfg?.printingCost || 50000,
        defaultMemberTarget: legacyCfg?.defaultMemberTarget || 25000
      });
      console.log(`Initialized default active campaign: ${campaign.campaignCode}`);
    }

    cachedActiveCampaign = campaign;
    return campaign;
  } catch (err) {
    console.error('getActiveCampaign error:', err);
    // Return a safe memory fallback if database is in mock or offline mode
    return {
      _id: 'default_campaign_id',
      campaignCode: 'CAMP-2026',
      name: 'Life Skill Course — Calendar Camp 2026',
      status: 'active',
      isActive: true,
      totalStock: 5000,
      calendarPrice: 100,
      initialInvestment: 20000,
      printingCost: 50000,
      defaultMemberTarget: 25000
    };
  }
}

export async function backfillCampaignData(campaignId) {
  if (!campaignId) return;
  try {
    await Promise.all([
      Team.updateMany({ campaignId: null }, { $set: { campaignId } }),
      StockAllocation.updateMany({ campaignId: null }, { $set: { campaignId } }),
      Distribution.updateMany({ campaignId: null }, { $set: { campaignId } }),
      Collection.updateMany({ campaignId: null }, { $set: { campaignId } }),
      Expense.updateMany({ campaignId: null }, { $set: { campaignId } }),
      MoneyTransfer.updateMany({ campaignId: null }, { $set: { campaignId } })
    ]);
  } catch (err) {
    console.warn('backfillCampaignData non-blocking notice:', err.message);
  }
}
