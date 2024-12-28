// ... existing imports ...

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('Quota exceeded')) {
        console.log(`Rate limit hit, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
        await wait(delay);
        delay *= 2;  // exponential backoff
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}

// ... rest of the code ...

// Update the updateTweetMetrics function to use batched updates:
if (updatedMetrics.length > 0) {
  console.log(`Updating ${updatedMetrics.length} existing rows...`);
  // Process in smaller batches
  const batchSize = 10;
  for (let i = 0; i < updatedMetrics.length; i += batchSize) {
    const batch = updatedMetrics.slice(i, i + batchSize);
    const updateRequests = batch.map(({ rowNumber, values }) => ({
      range: `PostMetrics!A${rowNumber}:N${rowNumber}`,
      values: [values]
    }));

    for (const request of updateRequests) {
      await retryWithBackoff(async () => {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: request.range,
          valueInputOption: 'USER_ENTERED',
          resource: { values: request.values }
        });
      });
      // Add a small delay between updates
      await wait(500);
    }
    // Add a larger delay between batches
    await wait(2000);
  }
}

if (newMetrics.length > 0) {
  console.log(`Appending ${newMetrics.length} new rows...`);
  // Process new rows in batches as well
  const batchSize = 10;
  for (let i = 0; i < newMetrics.length; i += batchSize) {
    const batch = newMetrics.slice(i, i + batchSize);
    await retryWithBackoff(async () => {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'PostMetrics!A:N',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: batch
        }
      });
    });
    // Add a delay between batches
    await wait(2000);
  }
}