import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    campaignCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days default
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'archived'],
      default: 'active',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    // Stock and financial configurations per campaign
    totalStock: {
      type: Number,
      required: true,
      default: 5000,
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
      default: 20000,
      min: 0
    },
    printingCost: {
      type: Number,
      default: 50000,
      min: 0
    },
    defaultMemberTarget: {
      type: Number,
      default: 25000,
      min: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Campaign', campaignSchema);
