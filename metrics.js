import { google } from 'googleapis';
import { ApifyClient } from 'apify-client';
import { authorize } from './google-auth.js';

const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

async function getTweetMetrics(tweetId) {
  console.log(`Fetching metrics for tweet: ${tweetId}`);
  try {
    const run = await apifyClient.actor('apify/twitter-scraper').call({
      tweetIDs: [tweetId],
      maxItems: 1,
      filter: {
        replies: false,
        retweets: false,
        media: false
      }
    });

    const { items } = await run.dataset().listItems();
    console.log(`Got response for tweet ${tweetId}:`, items);
    
    if (!items || items.length === 0) {
      throw new Error(`No data found for tweet ID: ${tweetId}`);
    }

    // Get the first (and should be only) item
    const tweetData = items[0];

    // Validate the essential fields
    if (!tweetData.id) {
      throw new Error(`Invalid tweet data received for ID: ${tweetId}`);
    }

    return tweetData;
  } catch (error) {
    console.error(`Error fetching tweet ${tweetId}:`, error);
    throw error;
  }
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

  if (!logRange.data.values || logRange.data.values.length <= 1) {
    throw new Error('No data found in Log sheet');
  }

  const rows = logRange.data.values.slice(1); // Skip header row
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
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, batch);
    
    await Promise.all(batch.map(async (tweetId) => {
      try {
        const tweetData = await getTweetMetrics(tweetId);
        console.log(`Got data for tweet ${tweetId}:`, tweetData);
        
        metrics.push([
          tweetData.createdAt,
          tweetId,
          `https://twitter.com/${tweetData.author?.userName}`,
          tweetData.createdAt,
          tweetData.viewCount || 0,
          tweetData.likeCount || 0,
          tweetData.replyCount || 0,
          tweetData.retweetCount || 0,
          tweetData.bookmarkCount || 0,
          new Date().toISOString(),
          tweetData.url || `https://twitter.com/i/web/status/${tweetId}`,
          tweetData.text || '',
          tweetData.isReply ? 'Yes' : 'No',
          tweetData.isQuote ? 'Yes' : 'No'
        ]);
      } catch (error) {
        console.error(`Error processing tweet ${tweetId}:`, error);
        errors.push({ tweetId, error: error.message });
      }
    }));

    // Add delay between batches to respect rate limits
    if (i + batchSize < tweetIds.length) {
      console.log('Waiting between batches...');
      await new Promise(resolve => setTimeout(resolve, 2000));
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