import { google } from 'googleapis';
import fetch from 'node-fetch';
import { authorize } from './google-auth.js';

async function waitForActorRun(runId, token) {
  const statusCheckUrl = `https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/runs/${runId}?token=${token}`;
  const datasetUrl = `https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/runs/${runId}/dataset/items?token=${token}`;

  // Wait and check run status
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const statusResponse = await fetch(statusCheckUrl);
      const statusData = await statusResponse.json();

      console.log('Run Status:', statusData.data.status);

      if (statusData.data.status === 'SUCCEEDED') {
        // Fetch dataset items
        const datasetResponse = await fetch(datasetUrl);
        const items = await datasetResponse.json();

        console.log('Dataset Items:', JSON.stringify(items, null, 2));
        return items;
      } else if (statusData.data.status === 'FAILED') {
        throw new Error('Actor run failed');
      }

      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Error checking run status:', error);
      throw error;
    }
  }

  throw new Error('Actor run timed out');
}

async function getTweetMetrics(tweetId) {
  try {
    console.log(`Fetching metrics for tweet: ${tweetId}`);
    
    const runUrl = `https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/runs?token=${process.env.APIFY_TOKEN}`;
    
    const requestBody = {
      tweetIDs: [tweetId],
      twitterContent: "make",
      maxItems: 1,
      queryType: "Latest",
      lang: "en",
      from: "elonmusk"
    };

    console.log('API Run Request URL:', runUrl);
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));

    // Initiate actor run
    const runResponse = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Run API Response Error:', {
        status: runResponse.status,
        statusText: runResponse.statusText,
        body: errorText
      });
      throw new Error(`Actor run failed: ${runResponse.status} ${runResponse.statusText}`);
    }

    const runData = await runResponse.json();
    console.log('Run Data:', JSON.stringify(runData, null, 2));

    // Wait for and retrieve run results
    const items = await waitForActorRun(runData.data.id, process.env.APIFY_TOKEN);

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

// Rest of the file remains the same as in the previous implementation
// (updateTweetMetrics function)

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

  // [Previous selection logic remains the same]
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

    // [Rest of the switch cases remain the same]
  }

  // Rest of the function remains the same

  // Ensure the return value matches Apps Script expectations
  return { 
    updatedCount: metrics.length,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined
  };
}

export { updateTweetMetrics };
