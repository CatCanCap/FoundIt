require('./lib/config');
const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health-routes');
const authRoutes = require('./routes/auth-routes');
const spotsRoutes = require('./routes/spots-routes');
const categoriesRoutes = require('./routes/categories-routes');
const coloursRoutes = require('./routes/colours-routes');
const itemsRoutes = require('./routes/items-routes');
const matchesRoutes = require('./routes/matches-routes');
const statsRoutes = require('./routes/stats-routes');
const claimsRoutes = require('./routes/claims-routes');
const messagesRoutes = require('./routes/messages-routes');
const handoffsRoutes = require('./routes/handoffs-routes');
const cronRoutes = require('./routes/cron-routes');
const disputesRoutes = require('./routes/disputes-routes');
const reportsRoutes = require('./routes/reports-routes');
const adminRoutes = require('./routes/admin-routes');
const appealsRoutes = require('./routes/appeals-routes');
const visionRoutes = require('./routes/vision-routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Small hardening: do not advertise Express, and stop browsers from guessing
// content types
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// The Vite dev server runs on another port, so allow localhost (as in Week 5).
// In production the client and API share one address and need no CORS.
app.use(cors({
  origin: [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/],
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/spots', spotsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/colours', coloursRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/handoffs', handoffsRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/vision', visionRoutes);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
