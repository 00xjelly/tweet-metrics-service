// Configuration
const API_URL = 'YOUR_RAILWAY_URL'; // e.g., 'https://tweet-metrics-service-production.up.railway.app';

// Create menu when spreadsheet opens
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Tweet Metrics')
    .addItem('Update Metrics', 'showUpdateDialog')
    .addToUi();
}

// Show the update dialog
function showUpdateDialog() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 400px;
        margin: 0 auto;
      }
      .form-group {
        margin-bottom: 20px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
      }
      select, input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }
      .input-wrapper {
        margin-top: 10px;
      }
      button {
        background-color: #4285f4;
        color: white;
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        width: 100%;
      }
      button:hover {
        background-color: #357abd;
      }
      .status {
        margin-top: 20px;
        padding: 15px;
        border-radius: 4px;
        display: none;
      }
      .status.error {
        background-color: #fdecea;
        color: #dc3545;
        border: 1px solid #f5c6cb;
      }
      .status.success {
        background-color: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }
      .status.loading {
        background-color: #fff3cd;
        color: #856404;
        border: 1px solid #ffeeba;
      }
    </style>

    <div class="container">
      <div class="form-group">
        <label for="updateType">Update Type:</label>
        <select id="updateType" onchange="toggleInputs()">
          <option value="single">Single Tweet</option>
          <option value="multiple">Multiple Tweets</option>
          <option value="month">By Month</option>
          <option value="all">All Tweets</option>
        </select>

        <div id="inputWrapper" class="input-wrapper">
          <!-- Input field will be dynamically inserted here -->
        </div>
      </div>

      <button onclick="updateMetrics()">Update Metrics</button>
      <div id="status" class="status"></div>
    </div>

    <script>
      // Initialize the form
      document.addEventListener('DOMContentLoaded', function() {
        toggleInputs();
      });

      // Toggle input fields based on selection
      function toggleInputs() {
        const updateType = document.getElementById('updateType').value;
        const inputWrapper = document.getElementById('inputWrapper');
        let inputHtml = '';

        switch(updateType) {
          case 'single':
            inputHtml = `
              <label for="tweetId">Tweet ID:</label>
              <input type="text" id="tweetId" placeholder="Enter Tweet ID">
            `;
            break;
          case 'multiple':
            inputHtml = `
              <label for="tweetIds">Tweet IDs (comma-separated):</label>
              <input type="text" id="tweetIds" placeholder="ID1, ID2, ID3">
            `;
            break;
          case 'month':
            inputHtml = `
              <label for="monthPicker">Select Month:</label>
              <input type="month" id="monthPicker">
            `;
            break;
        }

        inputWrapper.innerHTML = inputHtml;
      }

      // Show status message
      function showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
      }

      // Update metrics
      function updateMetrics() {
        const updateType = document.getElementById('updateType').value;
        let selection = '';

        switch(updateType) {
          case 'single':
            selection = document.getElementById('tweetId').value;
            break;
          case 'multiple':
            selection = document.getElementById('tweetIds').value;
            break;
          case 'month':
            selection = document.getElementById('monthPicker').value;
            break;
        }

        if (updateType !== 'all' && !selection) {
          showStatus('Please fill in the required field', 'error');
          return;
        }

        showStatus('Updating metrics...', 'loading');

        google.script.run
          .withSuccessHandler(function(result) {
            showStatus(
              `Successfully updated ${result.updatedCount} tweet(s)` + 
              (result.failedCount ? `\n${result.failedCount} updates failed.` : ''),
              'success'
            );
          })
          .withFailureHandler(function(error) {
            showStatus('Error: ' + error.message, 'error');
          })
          .triggerMetricsUpdate(updateType, selection);
      }
    </script>
  `)
  .setTitle('Update Tweet Metrics')
  .setWidth(450)
  .setHeight(400);

  SpreadsheetApp.getUi().showModalDialog(html, 'Update Tweet Metrics');
}

// Function to trigger the metrics update
function triggerMetricsUpdate(type, selection) {
  const payload = {
    type: type,
    selection: selection
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(API_URL + '/update-metrics', options);
    const result = JSON.parse(response.getContentText());

    if (!result.success) {
      throw new Error(result.error || 'Update failed');
    }

    return result.result;
  } catch (error) {
    throw new Error('Failed to update metrics: ' + error.message);
  }
}