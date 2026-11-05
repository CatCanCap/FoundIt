// Loads settings from config.env (or the file named in ENV_FILE).
// On Vercel there is no file; the settings come from the project's
// environment variables instead, and dotenv does nothing.
const path = require('path');
const dotenv = require('dotenv');

const file = process.env.ENV_FILE || 'config.env';
// override: the file wins over anything already set in the shell, so a stray
// exported variable cannot point the seed script or the tests at another database
dotenv.config({ path: path.join(__dirname, '..', file), quiet: true, override: true });
