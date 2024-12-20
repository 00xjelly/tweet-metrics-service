import { google } from 'googleapis';
import { authorize } from './google-auth.js';
import fetch from 'node-fetch';

const APIFY_URL = 'https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/run-sync-get-dataset-items';

// Function to format date to YYYY-MM-DD
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn(`Error formatting date: ${dateString}`, error);
    return dateString;
  }
}

async function getTweetMetrics(tweetIds) {
  console.log(`Fetching metrics for tweets: ${tweetIds}`);
  try {
    const response = await fetch(`${APIFY_URL}?token=${process.env.APIFY_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tweetIDs: tweetIds,
        maxItems: tweetIds.length,
        queryType: 'Latest'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Got response for tweets:`, data);
    
    // More aggressive filtering to remove mock entries
    const filteredData = data.filter(tweet => 
      tweet && 
      tweet.type !== 'mock_tweet' && 
      tweet.id !== -1 && 
      tweet.text && 
      tweet.text.length > 0 &&
      !tweet.text.includes('From KaitoEasyAPI, a reminder:') &&
      tweet.id &&
      typeof tweet.id === 'string'
    );

    console.log(`Filtered tweets:`, filteredData);

    return filteredData;
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
      const rowIndex = parseInt(selection) - 2; // -2 because of 0-based index and header row
      console.log('Single row selection:', {
        selection,
        rowIndex,
        rowsLength: rows.length,
        rowData: rows[rowIndex]
      });
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const tweetId = rows[rowIndex][3]; // Column D contains Tweet ID
        console.log('Single tweet ID:', { tweetId, type: typeof tweetId });
        if (tweetId) tweetIds.push(tweetId.toString().trim());
      }
      break;

    case 'multiple':
      const rowNumbers = selection.split(',').map(num => parseInt(num.trim()) - 2);
      console.log('Multiple row selection:', { 
        selection, 
        rowNumbers,
        rowsLength: rows.length
      });
      tweetIds = rowNumbers
        .filter(idx => idx >= 0 && idx < rows.length)
        .map(idx => {
          const tweetId = rows[idx][3];
          console.log(`Row ${idx} tweet ID:`, { tweetId, type: typeof tweetId });
          return tweetId;
        })
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

  console.log('Final tweet IDs:', tweetIds);

  if (tweetIds.length === 0) {
    throw new Error('No valid tweet IDs found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 15; // Match Apify's batch processing
  const totalTweets = tweetIds.length;

  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i/batchSize) + 1;
    console.log(`Processing batch ${batchNumber} (${batch.length} tweets):`, batch);
    
    try {
      const batchTweetData = await getTweetMetrics(batch);
      
      console.log(`Batch ${batchNumber} - Successful tweets: ${batchTweetData.length} out of ${batch.length}`);

      const batchMetrics = batchTweetData.map(tweetData => [
        new Date().toISOString(), // Column A: Current timestamp
        tweetData.id,
        `https://twitter.com/${tweetData.author?.userName || ''}`,
        formatDate(tweetData.createdAt), // Column D: Formatted tweet date
        tweetData.viewCount || 0,
        tweetData.likeCount || 0,
        tweetData.replyCount || 0,
        tweetData.retweetCount || 0,
        tweetData.bookmarkCount || 0,
        formatDate(tweetData.createdAt), // Column J: Update timestamp
        tweetData.url || `https://twitter.com/i/web/status/${tweetData.id}`,
        tweetData.text || '',
        tweetData.isReply ? 'Yes' : 'No',
        tweetData.isQuote ? 'Yes' : 'No'
      ]);

      metrics.push(...batchMetrics);

      // Track failed tweets in this batch
      const failedTweets = batch.filter(tweetId => 
        !batchTweetData.some(tweet => tweet.id === tweetId)
      );

      if (failedTweets.length > 0) {
        console.warn(`Batch ${batchNumber} - Failed tweets:`, failedTweets);
        errors.push(...failedTweets.map(tweetId => ({
          tweetId,
          error: 'No data retrieved for tweet'
        })));
      }
    } catch (batchError) {
      console.error(`Error processing batch ${batchNumber}:`, batchError);
      errors.push(...batch.map(tweetId => ({ 
        tweetId, 
        error: batchError.message 
      })));
    }

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < tweetIds.length) {
      console.log(`Waiting before next batch (${i + batchSize}/${totalTweets} processed)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('Metrics to append:', metrics);

  if (metrics.length > 0) {
    console.log('Appending to PostMetrics sheet...');
    
    // Append to the bottom of the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'PostMetrics!A:N',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: metrics
      }
    });
  }

  const result = { 
    totalTweets,
    updatedCount: metrics.length,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  };
  
  console.log('Update complete:', result);
  return result;
}

export { updateTweetMetrics };
