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

async function getLatestSheetData(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  const filesRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
    orderBy: 'createdTime desc',
    pageSize: 30,
    fields: 'files(id, name, createdTime)',
  });

  const files = filesRes.data.files;
  if (!files || files.length === 0) return { today: null, history: [] };

  const latest = files[0];
  const latestData = await sheets.spreadsheets.values.get({
    spreadsheetId: latest.id,
    range: 'A1:Z100',
  });

  const history = [];
  for (const file of files.slice(0, 7)) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: file.id,
        range: 'A1:Z100',
      });
      history.push({ date: file.name, data: res.data.values });
    } catch (e) {}
  }

  return {
    today: { name: latest.name, values: latestData.data.values },
    history,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const auth = await getAuthClient();
    const data = await getLatestSheetData(auth);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
