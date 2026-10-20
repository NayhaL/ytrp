require('dotenv').config();

const app = require('./app');
const cors = require('cors');

app.use(cors());

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
