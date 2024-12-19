import { google } from 'googleapis';

// Function to authorize Google Sheets API
async function authorize() {
  try {
    // Load credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    // Create a new JWT client
    const client = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    // Authenticate and return the client
    await client.authorize();
    return client;
  } catch (error) {
    console.error('Google Authentication Error:', error);
    throw new Error('Failed to authenticate with Google: ' + error.message);
  }
}

export { authorize };