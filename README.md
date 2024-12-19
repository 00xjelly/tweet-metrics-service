# Tweet Metrics Service

A service to sync tweet metrics from Apify to Google Sheets.

## Setup

1. Set environment variables:
   - `GOOGLE_CREDENTIALS`: Google service account credentials (JSON)
   - `SPREADSHEET_ID`: Google Sheets spreadsheet ID
   - `APIFY_TOKEN`: Apify API token

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the service:
   ```bash
   npm start
   ```

## API Endpoints

### POST /update-metrics

Update tweet metrics based on specified criteria.

```json
{
  "type": "single|multiple|month|all",
  "selection": "value"
}
```

## Google Sheets Structure

Requires two sheets:
- 'Log': Contains tweet IDs in column D
- 'PostMetrics': Stores the metrics data