require('dotenv').config();

const app = require('./app');
const { startCompanySyncScheduler } = require('./services/companyService');
const {
  ensureCompanyStatusColumn,
  ensureCompanySyncStateTable,
} = require('./config/database');

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await ensureCompanyStatusColumn();
    await ensureCompanySyncStateTable();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      startCompanySyncScheduler();
    });
  } catch (error) {
    console.error('Could not prepare company database schema:', error);
    process.exitCode = 1;
  }
}

void startServer();
