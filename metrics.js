import { google } from 'googleapis';
import { authorize } from './google-auth.js';
import fetch from 'node-fetch';

const APIFY_URL = 'https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/run-sync-get-dataset-items';

async function getTweetMetrics(tweetId) {
  console.log(`Fetching metrics for tweet: ${tweetId}`);
  try {
    const response = await fetch(`${APIFY_URL}?token=${process.env.APIFY_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tweetIDs: [tweetId],
        maxItems: 1,
        queryType: 'Latest'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Got response for tweet ${tweetId}:`, data);
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No data found for tweet ID: ${tweetId}`);
    }

    return data[0];
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
      const rowIndex = parseInt(selection) - 2; // -2 because of 0-based index and header row
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const tweetId = rows[rowIndex][3]; // Column D contains Tweet ID
        if (tweetId) tweetIds.push(tweetId.toString().trim());
      }
      break;

    case 'multiple':
      const rowNumbers = selection.split(',').map(num => parseInt(num.trim()) - 2);
      tweetIds = rowNumbers
        .filter(idx => idx >= 0 && idx < rows.length)
        .map(idx => rows[idx][3])
        .filter(id => id)
        .map(id => id.toString().trim());
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
            const tweetId = row[3];
            if (tweetId) tweetIds.push(tweetId.toString().trim());
          }
        } catch (error) {
          console.warn(`Invalid date format in row ${idx + 2}: ${dateStr}`);
        }
      });
      break;

    case 'all':
      tweetIds = rows
        .map(row => row[3])
        .filter(id => id)
        .map(id => id.toString().trim());
      break;

    default:
      throw new Error('Invalid selection type. Use: single, multiple, month, or all');
  }

  console.log('Tweet IDs to update:', tweetIds);

  if (tweetIds.length === 0) {
    throw new Error('No valid tweet IDs found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 5;

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
          `https://twitter.com/${tweetData.author?.userName || ''}`,
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