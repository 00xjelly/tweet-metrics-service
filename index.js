import express from 'express';
import dotenv from 'dotenv';
import { updateTweetMetrics } from './metrics.js';

dotenv.config();

const app = express();
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Request body:', req.body);
  next();
});

app.post('/update-metrics', async (req, res) => {
  console.log('Received update-metrics request:', req.body);
  try {
    const { type, selection } = req.body;
    
    if (!type) {
      throw new Error('Missing required field: type');
    }

    console.log(`Processing request - Type: ${type}, Selection: ${selection}`);
    const result = await updateTweetMetrics(type, selection);
    
    console.log('Update completed successfully:', result);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error processing request:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.stack
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Tweet Metrics Service is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- GOOGLE_CREDENTIALS set:', !!process.env.GOOGLE_CREDENTIALS);
  console.log('- SPREADSHEET_ID set:', !!process.env.SPREADSHEET_ID);
  console.log('- APIFY_TOKEN set:', !!process.env.APIFY_TOKEN);
});
