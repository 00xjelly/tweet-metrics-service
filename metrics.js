import { google } from 'googleapis';
import { authorize } from './google-auth.js';

async function getTweetMetrics(tweetIds) {
  console.log(`Fetching metrics for tweets:`, tweetIds);
  try {
    // Format tweet IDs for API request
    const tweetQuery = tweetIds.join(',');

    const response = await fetch(
      `https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tweetIDs: tweetIds,
          maxItems: tweetIds.length || 1,
          queryType: 'Latest',
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const items = await response.json();
    console.log(`Got response from Apify:`, items);
    
    if (!Array.isArray(items)) {
      throw new Error('Invalid response format from Apify');
    }

    return items;
  } catch (error) {
    console.error(`Error fetching tweets:`, error);
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
  const batchSize = 5; // Process in small batches

  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, batch);
    
    try {
      const tweetDataList = await getTweetMetrics(batch);
      
      tweetDataList.forEach(tweetData => {
        if (tweetData && tweetData.id) {
          metrics.push([
            tweetData.createdAt,
            tweetData.id,
            `https://twitter.com/${tweetData.author?.userName}`,
            tweetData.createdAt,
            tweetData.viewCount || 0,
            tweetData.likeCount || 0,
            tweetData.replyCount || 0,
            tweetData.retweetCount || 0,
            tweetData.bookmarkCount || 0,
            new Date().toISOString(),
            tweetData.url || `https://twitter.com/i/web/status/${tweetData.id}`,
            tweetData.text || '',
            tweetData.isReply ? 'Yes' : 'No',
            tweetData.isQuote ? 'Yes' : 'No'
          ]);
        }
      });
    } catch (error) {
      console.error(`Error processing batch:`, error);
      batch.forEach(tweetId => {
        errors.push({ tweetId, error: error.message });
      });
    }

    // Add delay between batches
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