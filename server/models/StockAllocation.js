import mongoose from 'mongoose';

const stockAllocationSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    allocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
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

stockAllocationSchema.index({ teamId: 1, memberId: 1 }, { unique: true });

export default mongoose.model('StockAllocation', stockAllocationSchema);
