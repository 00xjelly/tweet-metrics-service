import express from 'express';
import dotenv from 'dotenv';
import { updateTweetMetrics } from './metrics.js';

dotenv.config();

const app = express();
app.use(express.json());

app.post('/update-metrics', async (req, res) => {
  console.log('Received update request:', req.body);
  try {
    const { type, selection } = req.body;
    const result = await updateTweetMetrics(type, selection);
    console.log('Update completed successfully:', result);
    
    // Ensure response matches Apps Script expectations
    res.json({
      success: true,
      updatedCount: result.updatedCount || 0,
      failedCount: result.failedCount || 0,
      error: result.errors ? result.errors[0]?.error : undefined
    });
  } catch (error) {
    console.error('Error updating metrics:', error);
    res.json({
      success: false,
      updatedCount: 0,
      failedCount: 0,
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Tweet Metrics Service is running',
    environment: {
      googleCredentialsSet: !!process.env.GOOGLE_CREDENTIALS,
      spreadsheetIdSet: !!process.env.SPREADSHEET_ID,
      apifyTokenSet: !!process.env.APIFY_TOKEN
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- GOOGLE_CREDENTIALS set:', !!process.env.GOOGLE_CREDENTIALS);
  console.log('- SPREADSHEET_ID set:', !!process.env.SPREADSHEET_ID);
  console.log('- APIFY_TOKEN set:', !!process.env.APIFY_TOKEN);
});
