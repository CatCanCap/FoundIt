// Local development only. Vercel imports app.js directly.
const app = require('./app');

const port = process.env.PORT || 8000;

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
