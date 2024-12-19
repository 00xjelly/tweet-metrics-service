import express from 'express';
import dotenv from 'dotenv';
import { updateTweetMetrics } from './metrics.js';

dotenv.config();

const app = express();
app.use(express.json());

app.post('/update-metrics', async (req, res) => {
  try {
    const { type, selection } = req.body;
    const result = await updateTweetMetrics(type, selection);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Tweet Metrics Service is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});