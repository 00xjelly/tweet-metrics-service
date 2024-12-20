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
    
    // Filter out mock or empty responses
    return data.filter(tweet => 
      tweet && 
      tweet.type !== 'mock_tweet' && 
      tweet.id !== -1 && 
      tweet.text !== "From KaitoEasyAPI, a reminder:..."
    );
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

  // [Previous selection logic remains the same]
  // ... [keep the existing switch statement for selecting tweet IDs]

  console.log('Tweet IDs to update:', tweetIds);

  if (tweetIds.length === 0) {
    throw new Error('No valid tweet IDs found for the given criteria');
  }

  const metrics = [];
  const errors = [];
  const batchSize = 15; // Match Apify's batch processing

  for (let i = 0; i < tweetIds.length; i += batchSize) {
    const batch = tweetIds.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}:`, batch);
    
    try {
      const batchTweetData = await getTweetMetrics(batch);
      
      const batchMetrics = batchTweetData.map(tweetData => [
        formatDate(tweetData.createdAt),
        tweetData.id,
        `https://twitter.com/${tweetData.author?.userName || ''}`,
        formatDate(tweetData.createdAt),
        tweetData.viewCount || 0,
        tweetData.likeCount || 0,
        tweetData.replyCount || 0,
        tweetData.retweetCount || 0,
        tweetData.bookmarkCount || 0,
        formatDate(new Date().toISOString()),
        tweetData.url || `https://twitter.com/i/web/status/${tweetData.id}`,
        tweetData.text || '',
        tweetData.isReply ? 'Yes' : 'No',
        tweetData.isQuote ? 'Yes' : 'No'
      ]);

      metrics.push(...batchMetrics);
    } catch (batchError) {
      console.error(`Error processing batch:`, batchError);
      errors.push(...batch.map(tweetId => ({ 
        tweetId, 
        error: batchError.message 
      })));
    }

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < tweetIds.length) {
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
    updatedCount: metrics.length,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  };
  
  console.log('Update complete:', result);
  return result;
}

export { updateTweetMetrics };
