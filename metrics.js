import { ApifyClient } from 'apify-client';
import { google } from 'googleapis';
import { authorize } from './google-auth.js';

// Initialize the ApifyClient with API token
const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function getTweetMetrics(tweetId) {
  try {
    console.log(`Fetching metrics for tweet: ${tweetId}`);

    // Prepare Actor input
    const input = {
      "tweetIDs": [tweetId],
      "twitterContent": "make -\"live laugh love\"",
      "searchTerms": [
        `from:elonmusk since:2024-01-01_00:00:00_UTC until:2024-12-31_23:59:59_UTC`,
      ],
      "maxItems": 1,
      "queryType": "Latest",
      "lang": "en",
      "from": "elonmusk",
      "filter:verified": false,
      "filter:blue_verified": false,
      "since": "2021-12-31_23:59:59_UTC",
      "until": "2024-12-31_23:59:59_UTC",
      "filter:nativeretweets": false,
      "include:nativeretweets": false,
      "filter:replies": false,
      "filter:quote": false,
      "filter:has_engagement": false,
      "min_retweets": 0,
      "min_faves": 0,
      "min_replies": 0,
      "-min_retweets": 0,
      "-min_faves": 0,
      "-min_replies": 0,
      "filter:media": false,
      "filter:twimg": false,
      "filter:images": false,
      "filter:videos": false,
      "filter:native_video": false,
      "filter:vine": false,
      "filter:consumer_video": false,
      "filter:pro_video": false,
      "filter:spaces": false,
      "filter:links": false,
      "filter:mentions": false,
      "filter:news": false,
      "filter:safe": false,
      "filter:hashtags": false
    };

    console.log('Apify Input:', JSON.stringify(input, null, 2));

    // Run the Actor and wait for it to finish
    const run = await apifyClient.actor("CJdippxWmn9uRfooo").call(input);
    console.log('Run Details:', JSON.stringify(run, null, 2));

    // Fetch and print Actor results from the run's dataset
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    console.log('Dataset Items:', JSON.stringify(items, null, 2));

    if (!items || items.length === 0) {
      throw new Error(`No data found for tweet ID: ${tweetId}`);
    }

    const tweetData = items[0];

    // Transform data to match our expected structure
    return {
      createdAt: tweetData.createdAt || new Date().toISOString(),
      user: { 
        url: tweetData.author?.url || tweetData.author?.twitterUrl || ''
      },
      stats: {
        impressions: Number(tweetData.viewCount) || 0,
        likes: Number(tweetData.likeCount) || 0,
        replies: Number(tweetData.replyCount) || 0,
        retweets: Number(tweetData.retweetCount) || 0,
        bookmarks: Number(tweetData.bookmarkCount) || 0
      },
      text: tweetData.text || '',
      isReply: !!tweetData.isReply,
      isQuote: !!tweetData.isQuote
    };
  } catch (error) {
    console.error(`Comprehensive error for tweet ${tweetId}:`, {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
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
      const rowIndex = parseInt(selection) - 2;
      if (rowIndex >= 0 && rowIndex < rows.length) {
        selectedRows.push({
          rowNumber: rowIndex + 2,
          tweetId: rows[rowIndex][3]
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
        const dateStr = row[0];
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

  console.log('Selected rows:', JSON.stringify(selectedRows, null, 2));

  if (selectedRows.length === 0) {
    throw new Error('No valid rows found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 10;

  for (let i = 0; i < selectedRows.length; i += batchSize) {
    const batch = selectedRows.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, JSON.stringify(batch, null, 2));
    
    await Promise.all(batch.map(async ({ rowNumber, tweetId }) => {
      try {
        const tweetData = await getTweetMetrics(tweetId);
        console.log(`Got data for row ${rowNumber}, tweet ${tweetId}:`, JSON.stringify(tweetData, null, 2));
        
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
        console.error(`Error processing row ${rowNumber}:`, {
          tweetId,
          errorMessage: error.message,
          errorStack: error.stack
        });
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

  return { 
    updatedCount: metrics.length,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  };
}

export { updateTweetMetrics };
