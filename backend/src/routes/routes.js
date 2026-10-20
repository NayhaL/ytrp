const express = require('express');
const router = express.Router();


router.get('/message', (req, res) => {
    console.log('GET /api/message asdasdasd');
  res.json({ message: 'Terve Expressistä!' });
});

module.exports = router;