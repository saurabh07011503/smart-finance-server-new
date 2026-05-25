const fs = require('fs');
const path = require('path');

function resolveDataPath(filename) {
  const candidates = [
    path.join(__dirname, '..', 'data', filename),
    path.join(__dirname, '..', '..', 'client', 'app', 'data', filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Data file not found: ${filename}`);
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const lines = content.split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return headers.reduce((row, header, index) => {
      row[header] = values[index];
      return row;
    }, {});
  });

  return { headers, rows };
}

function parseMonth(value) {
  const normalized = value.length === 7 ? `${value}-01` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid month value: ${value}`);
  }
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date, short = false) {
  return date.toLocaleString('en-US', {
    month: short ? 'short' : 'long',
    year: 'numeric',
  });
}

function monthsBetween(start, end) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

/** Least-squares fit for y = a + b*x + c*x^2 */
function fitPolynomial2(xs, ys) {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const y = ys[i];
    const x2 = x * x;
    s0 += 1;
    s1 += x;
    s2 += x2;
    s3 += x2 * x;
    s4 += x2 * x2;
    t0 += y;
    t1 += x * y;
    t2 += x2 * y;
  }

  const matrix = [
    [s0, s1, s2, t0],
    [s1, s2, s3, t1],
    [s2, s3, s4, t2],
  ];

  return solveLinearSystem3(matrix);
}

function solveLinearSystem3(matrix) {
  const a = matrix.map((row) => [...row]);

  for (let col = 0; col < 3; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivotRow][col])) {
        pivotRow = row;
      }
    }

    if (Math.abs(a[pivotRow][col]) < 1e-12) {
      throw new Error('Unable to fit prediction model');
    }

    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
    }

    for (let row = col + 1; row < 3; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let j = col; j < 4; j += 1) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }

  const coeffs = [0, 0, 0];
  for (let row = 2; row >= 0; row -= 1) {
    let sum = a[row][3];
    for (let col = row + 1; col < 3; col += 1) {
      sum -= a[row][col] * coeffs[col];
    }
    coeffs[row] = sum / a[row][row];
  }

  return coeffs;
}

function predictPolynomial2(coeffs, x) {
  return coeffs[0] + coeffs[1] * x + coeffs[2] * x * x;
}

function weightedLinearRegression(xs, ys, weights) {
  let wSum = 0;
  let wxSum = 0;
  let wySum = 0;
  let wxxSum = 0;
  let wxySum = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const w = weights[i];
    const x = xs[i];
    const y = ys[i];
    wSum += w;
    wxSum += w * x;
    wySum += w * y;
    wxxSum += w * x * x;
    wxySum += w * x * y;
  }

  const denominator = wSum * wxxSum - wxSum * wxSum;
  const slope = (wSum * wxySum - wxSum * wySum) / denominator;
  const intercept = (wySum - slope * wxSum) / wSum;
  return { slope, intercept };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

module.exports = {
  resolveDataPath,
  parseCsv,
  parseMonth,
  formatMonth,
  monthsBetween,
  addMonths,
  fitPolynomial2,
  predictPolynomial2,
  weightedLinearRegression,
  round,
};
