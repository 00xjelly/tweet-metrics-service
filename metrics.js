import { ApifyClient } from 'apify-client';
import { google } from 'googleapis';
import { authorize } from './google-auth.js';

// Initialize the ApifyClient with API token
const apifyClient = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

// Mask sensitive information in logs
function maskToken(token) {
  return token ? `${token.slice(0, 4)}****${token.slice(-4)}` : 'NO TOKEN';
}

async function getTweetMetrics(tweetIds) {
  try {
    console.log('Apify Token:', maskToken(process.env.APIFY_TOKEN));
    
    // Ensure tweetIds is always an array
    const tweetIdArray = Array.isArray(tweetIds) ? tweetIds : [tweetIds];
    
    console.log(`Fetching metrics for tweets: ${tweetIdArray.join(', ')}`);
    console.log('Actor Client:', {
      token: maskToken(apifyClient.token),
      client: apifyClient
    });

    // Prepare Actor input with multiple tweet IDs
    const input = {
      "tweetIDs": tweetIdArray,
      "twitterContent": "make -\"live laugh love\"",
      "maxItems": tweetIdArray.length,
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

    console.log('Detailed Input Preparation:', {
      actorId: "CJdippxWmn9uRfooo",
      inputSize: tweetIdArray.length,
      inputPreview: JSON.stringify(input).slice(0, 500) + '...'
    });

    try {
      // Run the Actor and wait for it to finish
      console.log('Attempting to call actor...');
      const run = await apifyClient.actor("kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest").call(input);
      
      console.log('Run Details:', JSON.stringify({
        id: run.id,
        defaultDatasetId: run.defaultDatasetId
      }, null, 2));

      // Fetch Actor results from the run's dataset
      console.log('Fetching dataset items...');
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      console.log('Dataset Items Count:', items ? items.length : 'No items');

      if (!items || items.length === 0) {
        throw new Error(`No data found for tweet IDs: ${tweetIdArray.join(', ')}`);
      }

      // Transform each tweet's data
      return items.map(tweetData => ({
        tweetId: tweetData.id,
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
      }));
    } catch (callError) {
      console.error('Actor Call Error:', {
        message: callError.message,
        name: callError.name,
        stack: callError.stack,
        response: callError.response ? JSON.stringify(callError.response) : 'No response'
      });
      throw callError;
    }
  } catch (error) {
    console.error(`Comprehensive error for tweets:`, {
      tweetIds,
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    throw error;
  }
}

// Rest of the file remains the same as previous implementation

export { getTweetMetrics };
