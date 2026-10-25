const express = require('express');
const companyController = require('../controllers/companyController');
const router = express.Router();

router.get('/companies/sync-status', companyController.getSyncStatus);
router.post('/companies', companyController.createCompany);
router.post('/companies/lookup', companyController.lookupCompanies);

module.exports = router;