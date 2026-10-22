import mongoose from 'mongoose';

const distributionSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      default: null,
      index: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'flagged', 'corrected'],
      default: 'active',
      index: true
    },
    clientId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

distributionSchema.index({ teamId: 1, memberId: 1, date: -1 });

export default mongoose.model('Distribution', distributionSchema);
