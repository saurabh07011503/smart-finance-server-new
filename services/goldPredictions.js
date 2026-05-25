const axios = require('axios');
const {
  resolveDataPath,
  parseCsv,
  parseMonth,
  formatMonth,
  monthsBetween,
  addMonths,
  fitPolynomial2,
  predictPolynomial2,
  round,
} = require('./predictionUtils');

const OUNCE_TO_GRAMS = 31.1035;

async function fetchRealtimeGoldPrice(lastActualPrice) {
  const metalpriceApiKey = process.env.METALPRICE_API_KEY;
  const goldapiKey = process.env.GOLDAPI_IO_KEY;
  let goldPrice = null;
  let dataSource = 'fallback';

  if (metalpriceApiKey) {
    try {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${metalpriceApiKey}&base=USD&currencies=INR,XAU`;
      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200 && response.data?.rates?.XAU && response.data?.rates?.INR) {
        const goldPerOunceUsd = 1 / response.data.rates.XAU;
        goldPrice = round((goldPerOunceUsd / OUNCE_TO_GRAMS) * 10 * response.data.rates.INR);
        dataSource = 'metalpriceapi';
      }
    } catch (error) {
      console.warn('MetalPriceAPI error:', error.message);
    }
  }

  if (goldPrice === null && goldapiKey && goldapiKey !== 'your_goldapi_io_key_here') {
    try {
      const response = await axios.get('https://www.goldapi.io/api/XAU/INR', {
        headers: {
          'x-access-token': goldapiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      const rawPrice = response.data?.price;
      if (rawPrice) {
        goldPrice = round((rawPrice / OUNCE_TO_GRAMS) * 10);
        dataSource = 'goldapi_io';
      }
    } catch (error) {
      console.warn('GoldAPI error:', error.message);
    }
  }

  if (goldPrice === null) {
    try {
      const response = await axios.get('https://api.metals.live/v1/spot/gold', { timeout: 5000 });
      if (response.data?.price) {
        const usdToInr = 91.07;
        const goldPriceInr = response.data.price * usdToInr;
        goldPrice = round((goldPriceInr / OUNCE_TO_GRAMS) * 10);
        dataSource = 'metals_live';
      }
    } catch (error) {
      console.warn('Metals.live error:', error.message);
    }
  }

  if (goldPrice === null) {
    const hour = new Date().getHours();
    const fluctuationPercent =
      hour >= 9 && hour <= 16
        ? (Math.random() * 3 - 1.5)
        : (Math.random() * 1 - 0.5);
    goldPrice = round(lastActualPrice * (1 + fluctuationPercent / 100));
  }

  const realtimeChange = goldPrice - lastActualPrice;
  const realtimeChangePercent = (realtimeChange / lastActualPrice) * 100;

  return {
    currentPrice: goldPrice,
    priceChange: round(realtimeChange),
    priceChangePercent: round(realtimeChangePercent),
    lastUpdated: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    isRealtime: dataSource !== 'fallback',
    dataSource,
  };
}

async function getGoldPredictions() {
  const csvPath = resolveDataPath('gold_inr_monthly.csv');
  const { rows } = parseCsv(csvPath);

  const records = rows.map((row, index) => ({
    month: parseMonth(row.month),
    monthNum: index + 1,
    price: Number(row.price_inr_per_10g),
  }));

  const xs = records.map((record) => record.monthNum);
  const ys = records.map((record) => record.price);
  const coeffs = fitPolynomial2(xs, ys);

  const lastRecord = records[records.length - 1];
  const lastActualPrice = lastRecord.price;
  const now = new Date();
  const currentYearMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthsSinceLast = monthsBetween(lastRecord.month, currentYearMonth);

  const predictions = [];
  for (let i = 1; i <= 6; i += 1) {
    const predictionMonthNum = records.length + monthsSinceLast + i;
    const predictedPrice = predictPolynomial2(coeffs, predictionMonthNum);
    const predictionDate = addMonths(currentYearMonth, i);

    let change = 0;
    let changePct = 0;
    if (i > 1) {
      change = predictedPrice - predictions[predictions.length - 1].price;
      changePct = (change / predictions[predictions.length - 1].price) * 100;
    }

    predictions.push({
      month: formatMonth(predictionDate),
      monthShort: formatMonth(predictionDate, true),
      price: round(predictedPrice),
      change: round(change),
      changePct: round(changePct),
    });
  }

  const recentHistory = records.slice(-6).map((record) => ({
    month: formatMonth(record.month),
    monthShort: formatMonth(record.month, true),
    price: round(record.price),
  }));

  const avgPredicted = round(
    predictions.reduce((sum, item) => sum + item.price, 0) / predictions.length
  );
  const minPredicted = round(Math.min(...predictions.map((item) => item.price)));
  const maxPredicted = round(Math.max(...predictions.map((item) => item.price)));
  const expectedChange = round(predictions[predictions.length - 1].price - lastActualPrice);
  const expectedChangePct = round((expectedChange / lastActualPrice) * 100);

  let realtimeData;
  try {
    realtimeData = await fetchRealtimeGoldPrice(lastActualPrice);
    if (predictions.length > 0) {
      predictions[0].change = round(predictions[0].price - realtimeData.currentPrice);
      predictions[0].changePct = round(
        (predictions[0].change / realtimeData.currentPrice) * 100
      );
    }
  } catch (error) {
    realtimeData = {
      currentPrice: round(lastActualPrice),
      priceChange: 0,
      priceChangePercent: 0,
      lastUpdated: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      isRealtime: false,
    };
  }

  return {
    success: true,
    currentPrice: realtimeData.currentPrice,
    currentMonth: formatMonth(currentYearMonth),
    realtimeData,
    predictions,
    recentHistory,
    summary: {
      averagePrice: avgPredicted,
      minPrice: minPredicted,
      maxPrice: maxPredicted,
      expectedChange,
      expectedChangePct,
    },
  };
}

module.exports = { getGoldPredictions };
