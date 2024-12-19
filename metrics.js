import { google } from 'googleapis';
import { ApifyClient } from 'apify-client';
import { authorize } from './google-auth.js';

const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function getTweetMetrics(tweetId) {
  try {
    console.log(`Fetching metrics for tweet: ${tweetId}`);
    
    const run = await apifyClient.actor("CJdippxWmn9uRfooo").call({
      tweetIDs: [tweetId],
      maxItems: 1,
      queryType: "Latest",
      lang: "en",
      since: "2021-12-31_23:59:59_UTC",
      until: "2024-12-31_23:59:59_UTC"
    });

    const { items } = await run.dataset().listItems();
    
    if (!items || items.length === 0) {
      throw new Error(`No data found for tweet ID: ${tweetId}`);
    }

    const tweetData = items[0];
    console.log('Raw tweet data:', tweetData);

    // Validate and transform metrics with fallback values
    return {
      createdAt: tweetData.createdAt || new Date().toISOString(),
      user: { 
        url: tweetData.userUrl || tweetData.user?.url || ''
      },
      stats: {
        impressions: Number(tweetData.impressions) || 0,
        likes: Number(tweetData.likes) || 0,
        replies: Number(tweetData.replies) || 0,
        retweets: Number(tweetData.retweets) || 0,
        bookmarks: Number(tweetData.bookmarks) || 0
      },
      text: tweetData.text || '',
      isReply: !!tweetData.isReply,
      isQuote: !!tweetData.isQuote
    };
  } catch (error) {
    console.error(`Failed to fetch metrics for tweet ${tweetId}:`, error);
    throw error;
  }
}

async function updateTweetMetrics(type, selection) {
  console.log(`Starting update with type: ${type}, selection: ${selection}`)
  
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  
  console.log('Fetching data from Log sheet...');
  const logRange = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Log!A:D',
  });

  if (!logRange.data.values || logRange.data.values.length <= 1) {
    throw new Error('No data found in Log sheet');
  }

  const rows = logRange.data.values.slice(1); // Skip header row
  let selectedRows = [];

  switch(type) {
    case 'single':
      const rowIndex = parseInt(selection) - 2; // -2 because of 0-based index and header row
      if (rowIndex >= 0 && rowIndex < rows.length) {
        selectedRows.push({
          rowNumber: rowIndex + 2,
          tweetId: rows[rowIndex][3] // Column D contains Tweet ID
        });
      }
      break;

    case 'multiple':
      const rowNumbers = selection.split(',').map(num => num.trim());
      rowNumbers.forEach(rowNum => {
        const idx = parseInt(rowNum) - 2;
        if (idx >= 0 && idx < rows.length) {
          selectedRows.push({
            rowNumber: parseInt(rowNum),
            tweetId: rows[idx][3]
          });
        }
      });
      break;

    case 'month':
      const [year, month] = selection.split('-').map(num => parseInt(num, 10));
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        throw new Error('Invalid month format. Use YYYY-MM (e.g., 2024-01)');
      }

      rows.forEach((row, idx) => {
        const dateStr = row[0]; // Column A contains date
        try {
          const rowDate = new Date(dateStr);
          if (rowDate.getFullYear() === year && rowDate.getMonth() === month - 1) {
            selectedRows.push({
              rowNumber: idx + 2,
              tweetId: row[3]
            });
          }
        } catch (error) {
          console.warn(`Invalid date format in row: ${dateStr}`);
        }
      });
      break;

    case 'all':
      selectedRows = rows.map((row, idx) => ({
        rowNumber: idx + 2,
        tweetId: row[3]
      }));
      break;

    default:
      throw new Error('Invalid selection type. Use: single, multiple, month, or all');
  }

  console.log('Selected rows:', selectedRows);

  if (selectedRows.length === 0) {
    throw new Error('No valid rows found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 10;

  for (let i = 0; i < selectedRows.length; i += batchSize) {
    const batch = selectedRows.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, batch);
    
    await Promise.all(batch.map(async ({ rowNumber, tweetId }) => {
      try {
        const tweetData = await getTweetMetrics(tweetId);
        console.log(`Got data for row ${rowNumber}, tweet ${tweetId}:`, tweetData);
        
        metrics.push([
          tweetData.createdAt,
          tweetId,
          tweetData.user?.url || '',
          tweetData.createdAt,
          tweetData.stats?.impressions || 0,
          tweetData.stats?.likes || 0,
          tweetData.stats?.replies || 0,
          tweetData.stats?.retweets || 0,
          tweetData.stats?.bookmarks || 0,
          new Date().toISOString(),
          `https://twitter.com/i/web/status/${tweetId}`,
          tweetData.text || '',
          tweetData.isReply ? 'Yes' : 'No',
          tweetData.isQuote ? 'Yes' : 'No'
        ]);
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push({ rowNumber, error: error.message });
      }
    }));

    if (i + batchSize < selectedRows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (metrics.length > 0) {
    console.log('Appending to PostMetrics sheet...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PostMetrics!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: metrics
      },
    });
  }

  const result = { 
    updatedCount: metrics.length,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  };
  
  console.log('Update complete:', result);
  return result;
}

export { updateTweetMetrics };
