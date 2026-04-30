const { google } = require('googleapis');

const FOLDER_ID = '1mv6AnwJrA1oFU55Htb7aGrnHSE5f6jRw';

async function getAuthClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
  return auth;
}

function parseRows(values) {
  if (!values || values.length < 2) return {};
  const headers = values[0];
  const rows = values.slice(1);

  const col = (name) => headers.findIndex(h => h === name);

  const sum = (colName) => {
    const idx = col(colName);
    if (idx === -1) return null;
    return rows.reduce((acc, row) => {
      const v = parseFloat(row[idx]);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  };

  const last = (colName) => {
    const idx = col(colName);
    if (idx === -1) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = parseFloat(rows[i][idx]);
      if (!isNaN(v) && v > 0) return v;
    }
    return null;
  };

  const avg = (colName) => {
    const idx = col(colName);
    if (idx === -1) return null;
    const vals = rows.map(r => parseFloat(r[idx])).filter(v => !isNaN(v) && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return {
    activeEnergy:       Math.round(sum('Active Energy (kcal)') * 10) / 10,
    dietaryEnergy:      Math.round(sum('Dietary Energy (kcal)') * 10) / 10,
    steps:              Math.round(sum('Step Count (count)')),
    protein:            Math.round(sum('Protein (g)') * 10) / 10,
    carbs:              Math.round(sum('Carbohydrates (g)') * 10) / 10,
    fat:                Math.round(sum('Total Fat (g)') * 10) / 10,
    water:              Math.round(sum('Water (fl_oz_us)') * 10) / 10,
    weight:             last('Weight (lb)'),
    sleepTotal:         Math.round(last('Sleep Analysis [Total] (hr)') * 10) / 10,
    sleepDeep:          Math.round(last('Sleep Analysis [Deep] (hr)') * 10) / 10,
    sleepREM:           Math.round(last('Sleep Analysis [REM] (hr)') * 10) / 10,
    sleepCore:          Math.round(last('Sleep Analysis [Core] (hr)') * 10) / 10,
    heartRateAvg:       Math.round(avg('Heart Rate [Avg] (count/min)')),
    heartRateMin:       Math.round(avg('Heart Rate [Min] (count/min)')),
    heartRateMax:       Math.round(avg('Heart Rate [Max] (count/min)')),
    restingHeartRate:   Math.round(last('Resting Heart Rate (count/min)')),
    hrv:                Math.round(avg('Heart Rate Variability (ms)')),
    distance:           Math.round(sum('Walking + Running Distance (mi)') * 100) / 100,
    exerciseTime:       Math.round(sum('Apple Exercise Time (min)')),
    standHours:         Math.round(sum('Apple Stand Hour (count)')),
    bloodOxygen:        Math.round(avg('Blood Oxygen Saturation (%)') * 10) / 10,
    vo2max:             last('VO2 Max (ml/(kg·min))'),
    bodyFat:            last('Body Fat Percentage (%)'),
    bmi:                last('Body Mass Index (count)'),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const filesRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
      orderBy: 'name desc',
      pageSize: 7,
      fields: 'files(id, name)',
    });

    const files = filesRes.data.files;
    if (!files || files.length === 0) {
      return res.status(200).json({ success: true, data: { today: null, history: [] } });
    }

    const history = [];
    for (const file of files) {
      const sheetRes = await sheets.spreadsheets.values.get({
        spreadsheetId: file.id,
        range: 'A1:DZ2000',
      });
      const parsed = parseRows(sheetRes.data.values);
      history.push({ date: file.name.replace('HealthMetrics-', ''), ...parsed });
    }

    res.status(200).json({ success: true, data: { today: history[0], history } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
