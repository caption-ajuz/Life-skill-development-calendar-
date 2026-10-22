import mongoose from 'mongoose';

const campaignConfigSchema = new mongoose.Schema(
  {
    totalStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    calendarPrice: {
      type: Number,
      required: true,
      default: 100,
      min: 0
    },
    initialInvestment: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    printingCost: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    campaignYear: {
      type: Number,
      default: () => new Date().getFullYear()
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('CampaignConfig', campaignConfigSchema);
