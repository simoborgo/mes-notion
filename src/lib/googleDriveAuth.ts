import { google } from "googleapis";

let _client: ReturnType<typeof google.auth.fromJSON> | null = null;

export function getAuthClient() {
  if (_client) return _client;

  const credentials = process.env.GOOGLE_OAUTH_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS)
    : null;

  if (credentials) {
    _client = google.auth.fromJSON(credentials) as ReturnType<typeof google.auth.fromJSON>;
    return _client;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  _client = oauth2Client as unknown as ReturnType<typeof google.auth.fromJSON>;
  return _client;
}
