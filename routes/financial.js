const express = require('express');
const router = express.Router();
const FinancialProfile = require('../models/FinancialProfile');
const { getGoldPredictions } = require('../services/goldPredictions');
const { getStockPredictions } = require('../services/stockPredictions');

// Get investment recommendations based on financial profile
const getRecommendations = (profile) => {
  const { monthlyIncome, monthlyExpense, monthlySaving, riskLevel, investmentSpan, age } = profile;

  const savingsPercentage = (monthlySaving / monthlyIncome) * 100;
  let recommendations = {};

  // Rule-based recommendation engine
  if (riskLevel === 'low') {
    if (savingsPercentage < 20) {
      recommendations = {
        'Fixed Deposit': 55,
        'Gold': 30,
        'Mutual Fund': 10,
        'Stocks': 5
      };
    } else if (investmentSpan === 'long') {
      recommendations = {
        'Fixed Deposit': 40,
        'Gold': 30,
        'Mutual Fund': 25,
        'Stocks': 5
      };
    } else {
      recommendations = {
        'Fixed Deposit': 60,
        'Gold': 25,
        'Mutual Fund': 10,
        'Stocks': 5
      };
    }
  } else if (riskLevel === 'medium') {
    if (savingsPercentage > 50 && investmentSpan === 'long') {
      recommendations = {
        'Mutual Fund': 40,
        'Gold': 25,
        'Fixed Deposit': 20,
        'Stocks': 15
      };
    } else if (investmentSpan === 'short') {
      recommendations = {
        'Mutual Fund': 35,
        'Gold': 30,
        'Fixed Deposit': 25,
        'Stocks': 10
      };
    } else {
      recommendations = {
        'Mutual Fund': 45,
        'Gold': 25,
        'Fixed Deposit': 20,
        'Stocks': 10
      };
    }
  } else if (riskLevel === 'high') {
    if (savingsPercentage > 50 && age < 35) {
      recommendations = {
        'Stocks': 45,
        'Mutual Fund': 30,
        'Gold': 15,
        'Fixed Deposit': 10
      };
    } else if (investmentSpan === 'long') {
      recommendations = {
        'Stocks': 40,
        'Mutual Fund': 30,
        'Gold': 20,
        'Fixed Deposit': 10
      };
    } else {
      recommendations = {
        'Stocks': 35,
        'Mutual Fund': 35,
        'Gold': 20,
        'Fixed Deposit': 10
      };
    }
  }

  return recommendations;
};

// Submit or update financial profile
router.post('/profile', async (req, res) => {
  try {
    const { userId, age, monthlyIncome, monthlyExpense, monthlySaving, riskLevel, investmentSpan } = req.body;

    // Validation
    if (!userId || !age || !monthlyIncome || !monthlyExpense || !monthlySaving || !riskLevel || !investmentSpan) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    // Check if profile exists
    let profile = await FinancialProfile.findOne({ userId });

    if (profile) {
      // Update existing profile
      profile.age = age;
      profile.monthlyIncome = monthlyIncome;
      profile.monthlyExpense = monthlyExpense;
      profile.monthlySaving = monthlySaving;
      profile.riskLevel = riskLevel;
      profile.investmentSpan = investmentSpan;
      profile.updatedAt = Date.now();
    } else {
      // Create new profile
      profile = new FinancialProfile({
        userId,
        age,
        monthlyIncome,
        monthlyExpense,
        monthlySaving,
        riskLevel,
        investmentSpan
      });
    }

    await profile.save();

    // Generate recommendations
    const recommendations = getRecommendations(profile);

    res.json({
      message: 'Financial profile saved successfully',
      profile: {
        age: profile.age,
        monthlyIncome: profile.monthlyIncome,
        monthlyExpense: profile.monthlyExpense,
        monthlySaving: profile.monthlySaving,
        riskLevel: profile.riskLevel,
        investmentSpan: profile.investmentSpan
      },
      recommendations
    });
  } catch (error) {
    console.error('Profile submission error:', error);
    res.status(500).json({ error: 'Server error while saving profile' });
  }
});

// Get user's financial profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const profile = await FinancialProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const recommendations = getRecommendations(profile);

    res.json({
      profile: {
        age: profile.age,
        monthlyIncome: profile.monthlyIncome,
        monthlyExpense: profile.monthlyExpense,
        monthlySaving: profile.monthlySaving,
        riskLevel: profile.riskLevel,
        investmentSpan: profile.investmentSpan
      },
      recommendations
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error while fetching profile' });
  }
});

// Gold price predictions (runs in Node — no separate Python service required)
router.get('/gold-predictions', async (req, res) => {
  try {
    const data = await getGoldPredictions();
    res.json(data);
  } catch (error) {
    console.error('Gold prediction error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to fetch gold predictions.',
    });
  }
});

// Stock (SENSEX) predictions (runs in Node)
router.get('/stock-predictions', async (req, res) => {
  try {
    const data = getStockPredictions();
    res.json(data);
  } catch (error) {
    console.error('Stock prediction error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to fetch stock predictions.',
    });
  }
});

module.exports = router;
