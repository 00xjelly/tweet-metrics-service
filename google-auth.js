import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export async function authorize() {
  console.log('Starting Google authorization...');
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log('Successfully parsed Google credentials');
    
    const client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Initializing JWT client...');
    await client.authorize();
    console.log('Successfully authorized with Google');
    return client;
  } catch (error) {
    console.error('Error in Google authorization:', error);
    throw error;
  }
}