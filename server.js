import 'dotenv/config';
import { app } from './src/app.js';
import { connectDatabase } from './src/config/database.js';
import { validateEnvironment } from './src/config/env.js';

validateEnvironment();

connectDatabase().catch(() => {
  console.error('MongoDB connection failed; database-backed API routes are unavailable until the connection is restored.');
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`Gamer Review API listening on port ${port}`);
});
