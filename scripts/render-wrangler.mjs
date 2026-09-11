import { readFileSync, writeFileSync } from 'node:fs';

const [templatePath, outputPath, databaseId] = process.argv.slice(2);
if (!templatePath || !outputPath || !databaseId) throw new Error('template, output and D1 database ID are required');
const googleClientIds = process.env.GOOGLE_CLIENT_IDS?.trim() || 'oauth-not-configured';
const googleGmailClientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim() || 'gmail-oauth-not-configured';
const googleGmailRedirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim() || 'https://invalid.example/v1/integrations/gmail/callback';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.trim();
if (!allowedOrigins) throw new Error('ALLOWED_ORIGINS is required');
const rendered = readFileSync(templatePath, 'utf8')
  .replace('__D1_DATABASE_ID__', databaseId)
  .replace('__GOOGLE_CLIENT_IDS__', googleClientIds)
  .replace('__GOOGLE_GMAIL_CLIENT_ID__', googleGmailClientId)
  .replace('__GOOGLE_GMAIL_REDIRECT_URI__', googleGmailRedirectUri)
  .replace('__ALLOWED_ORIGINS__', allowedOrigins);
writeFileSync(outputPath, rendered);
