const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const Payment = require('../models/payment');
const Freight = require('../models/freight');
const { requireAdmin } = require('../middleware/auth');
const { uploadToBlob } = require('../utils/blobStorage');

// Configure multer with memory storage for Vercel Blob
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only .png and .jpg files are allowed!'));
};

const upload = multer({
    storage: memoryStorage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Apply admin auth to all routes
router.use(requireAdmin);

/**
 * POST /api/admin/payments
 * Create a new payment (with optional comprovante)
 */
router.post('/', upload.single('comprovante'), async (req, res) => {
    try {
        const { driver_id, date_range, total_value, freight_ids, abastecimento_ids, outros_insumo_ids } = req.body;

        if (!driver_id || !date_range || total_value === undefined) {
            return res.status(400).json({
                error: 'driver_id, date_range, and total_value are required'
            });
        }

        let parsedFreightIds = [];
        let parsedAbastecimentoIds = [];
        let parsedOutrosInsumoIds = [];

        try {
            if (freight_ids) parsedFreightIds = JSON.parse(freight_ids);
            if (abastecimento_ids) parsedAbastecimentoIds = JSON.parse(abastecimento_ids);
            if (outros_insumo_ids) parsedOutrosInsumoIds = JSON.parse(outros_insumo_ids);
        } catch (e) {
            return res.status(400).json({ error: 'IDs must be valid JSON arrays' });
        }

        // Handle file upload with Vercel Blob
        let comprovante_path = null;
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `payment-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            comprovante_path = url;
        }

        const payment = await Payment.create({
            driver_id: parseInt(driver_id),
            date_range,
            total_value: parseFloat(total_value),
            comprovante_path,
            freight_ids: parsedFreightIds,
            abastecimento_ids: parsedAbastecimentoIds,
            outros_insumo_ids: parsedOutrosInsumoIds
        });

        res.status(201).json(payment);
    } catch (error) {
        console.error('Create payment error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/admin/payments
 * List all payments or filter by driver
 */
router.get('/', async (req, res) => {
    try {
        const { driver_id } = req.query;

        let payments;
        if (driver_id) {
            payments = await Payment.findByDriver(parseInt(driver_id));
        } else {
            payments = await Payment.findAll();
        }

        res.json(payments);
    } catch (error) {
        console.error('List payments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/payments/:id
 * Get payment by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const payment = await Payment.findById(parseInt(req.params.id));
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json(payment);
    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/admin/payments/:id
 * Update payment (e.g., add comprovante)
 */
router.put('/:id', upload.single('comprovante'), async (req, res) => {
    try {
        const paymentId = parseInt(req.params.id);
        const payment = await Payment.findById(paymentId);

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const updateData = {};

        // Handle file upload with Vercel Blob
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `payment-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            updateData.comprovante_path = url;
        }

        const updated = await Payment.update(paymentId, updateData);
        res.json(updated);
    } catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/payments/:id
 * Delete payment
 */
router.delete('/:id', async (req, res) => {
    try {
        const success = await Payment.delete(parseInt(req.params.id));
        if (!success) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json({ message: 'Payment deleted successfully' });
    } catch (error) {
        console.error('Delete payment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
