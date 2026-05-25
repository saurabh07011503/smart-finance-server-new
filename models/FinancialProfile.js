const mongoose = require('mongoose');

const financialProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  age: {
    type: Number,
    required: true
  },
  monthlyIncome: {
    type: Number,
    required: true
  },
  monthlyExpense: {
    type: Number,
    required: true
  },
  monthlySaving: {
    type: Number,
    required: true
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true
  },
  investmentSpan: {
    type: String,
    enum: ['short', 'medium', 'long'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FinancialProfile', financialProfileSchema);
