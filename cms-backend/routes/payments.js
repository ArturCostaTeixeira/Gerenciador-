const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const Payment = require('../models/payment');
const Freight = require('../models/freight');
const { requireAdmin } = require('../middleware/auth');

// Configure multer for payment proof uploads
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'payments');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `payment-${uniqueSuffix}${ext}`);
    }
});

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
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Apply admin auth to all routes
router.use(requireAdmin);

/**
 * POST /api/admin/payments
 * Create a new payment (with optional comprovante)
 */
router.post('/', upload.single('comprovante'), (req, res) => {
    try {
        const { driver_id, date_range, total_value, freight_ids } = req.body;

        if (!driver_id || !date_range || !total_value || !freight_ids) {
            return res.status(400).json({
                error: 'driver_id, date_range, total_value, and freight_ids are required'
            });
        }

        let parsedFreightIds;
        try {
            parsedFreightIds = JSON.parse(freight_ids);
        } catch (e) {
            return res.status(400).json({ error: 'freight_ids must be a valid JSON array' });
        }

        let comprovante_path = null;
        if (req.file) {
            comprovante_path = '/uploads/payments/' + req.file.filename;
        }

        const payment = Payment.create({
            driver_id: parseInt(driver_id),
            date_range,
            total_value: parseFloat(total_value),
            comprovante_path,
            freight_ids: parsedFreightIds
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
router.get('/', (req, res) => {
    try {
        const { driver_id } = req.query;

        let payments;
        if (driver_id) {
            payments = Payment.findByDriver(parseInt(driver_id));
        } else {
            payments = Payment.findAll();
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
router.get('/:id', (req, res) => {
    try {
        const payment = Payment.findById(parseInt(req.params.id));
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
router.put('/:id', upload.single('comprovante'), (req, res) => {
    try {
        const paymentId = parseInt(req.params.id);
        const payment = Payment.findById(paymentId);

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const updateData = {};

        if (req.file) {
            updateData.comprovante_path = '/uploads/payments/' + req.file.filename;
        }

        const updated = Payment.update(paymentId, updateData);
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
router.delete('/:id', (req, res) => {
    try {
        const success = Payment.delete(parseInt(req.params.id));
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
