import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['printing', 'transport', 'food', 'communication', 'stationery', 'other'],
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
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

export default mongoose.model('Expense', expenseSchema);
