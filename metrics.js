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

  // [Previous tweet ID selection logic remains the same]

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
