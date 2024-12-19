import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export async function authorize() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await client.authorize();
  return client;
}