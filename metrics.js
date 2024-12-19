import { google } from 'googleapis';
import { ApifyClient } from 'apify-client';
import { authorize } from './google-auth.js';

const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function getTweetMetrics(tweetId) {
  console.log(`Fetching metrics for tweet: ${tweetId}`);
  const run = await apifyClient.actor('apify/twitter-scraper').call({
    tweetUrls: [`https://twitter.com/i/web/status/${tweetId}`],
  });

  const { items } = await run.dataset().listItems();
  console.log(`Got response for tweet ${tweetId}:`, items);
  
  if (!items || items.length === 0) {
    throw new Error(`No data found for tweet ID: ${tweetId}`);
  }
  return items[0];
}

async function updateTweetMetrics(type, selection) {
  console.log(`Starting update with type: ${type}, selection: ${selection}`);
  
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  
  console.log('Fetching data from Log sheet...');
  const logRange = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Log!A:D',
  });

  console.log('Log sheet data:', logRange.data.values);

  if (!logRange.data.values || logRange.data.values.length <= 1) {
    throw new Error('No data found in Log sheet');
  }

  const rows = logRange.data.values.slice(1);
  let tweetIds = [];

  switch(type) {
    case 'single':
      tweetIds = [selection];
      break;

    case 'multiple':
      tweetIds = selection.split(',').map(id => id.trim());
      break;

    case 'month':
      const [year, month] = selection.split('-').map(num => parseInt(num, 10));
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        throw new Error('Invalid month format. Use YYYY-MM (e.g., 2024-01)');
      }

      rows.forEach(row => {
        const dateStr = row[0];
        const tweetId = row[3];
        try {
          const rowDate = new Date(dateStr);
          if (rowDate.getFullYear() === year && rowDate.getMonth() === month - 1) {
            tweetIds.push(tweetId);
          }
        } catch (error) {
          console.warn(`Invalid date format in row: ${dateStr}`);
        }
      });
      break;

    case 'all':
      tweetIds = rows.map(row => row[3]);
      break;

    default:
      throw new Error('Invalid selection type. Use: single, multiple, month, or all');
  }

  console.log('Tweet IDs to update:', tweetIds);

  if (tweetIds.length === 0) {
    throw new Error('No tweet IDs found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 10;

  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1}:`, batch);
    
    await Promise.all(batch.map(async (tweetId) => {
      try {
        const tweetData = await getTweetMetrics(tweetId);
        console.log(`Got data for tweet ${tweetId}:`, tweetData);
        
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
        console.error(`Error processing tweet ${tweetId}:`, error);
        errors.push({ tweetId, error: error.message });
      }
    }));

    if (i + batchSize < tweetIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Metrics to append:', metrics);

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