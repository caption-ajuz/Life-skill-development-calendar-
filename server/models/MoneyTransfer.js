import mongoose from 'mongoose';

const moneyTransferSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    toDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    transferDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'awaiting_confirmation', 'confirmed', 'disputed'],
      default: 'pending',
      index: true
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    disputeReason: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    clientId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

moneyTransferSchema.index({ teamId: 1, status: 1, transferDate: -1 });

export default mongoose.model('MoneyTransfer', moneyTransferSchema);
