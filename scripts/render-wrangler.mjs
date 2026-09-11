import { readFileSync, writeFileSync } from 'node:fs';

const [templatePath, outputPath, databaseId] = process.argv.slice(2);
if (!templatePath || !outputPath || !databaseId) throw new Error('template, output and D1 database ID are required');
const googleClientIds = process.env.GOOGLE_CLIENT_IDS?.trim() || 'oauth-not-configured';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.trim();
if (!allowedOrigins) throw new Error('ALLOWED_ORIGINS is required');
const rendered = readFileSync(templatePath, 'utf8')
  .replace('__D1_DATABASE_ID__', databaseId)
  .replace('__GOOGLE_CLIENT_IDS__', googleClientIds)
  .replace('__ALLOWED_ORIGINS__', allowedOrigins);
writeFileSync(outputPath, rendered);
