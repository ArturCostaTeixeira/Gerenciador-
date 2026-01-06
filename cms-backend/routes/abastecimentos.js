const express = require('express');
const multer = require('multer');
const path = require('path');
const Abastecimento = require('../models/abastecimento');
const Driver = require('../models/driver');
const { requireAdmin, requireDriver } = require('../middleware/auth');
const { isValidDate, isPositiveNumber } = require('../utils/validators');
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

// ============================================
// ADMIN ROUTES - /api/admin/abastecimentos
// ============================================
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

/**
 * POST /api/admin/abastecimentos
 * Create abastecimento for a driver (admin only)
 */
adminRouter.post('/', upload.single('comprovante_abastecimento'), async (req, res) => {
    try {
        const { driver_id, date, quantity, price_per_liter } = req.body;

        // Validate input
        if (!driver_id || !date || quantity === undefined || price_per_liter === undefined) {
            return res.status(400).json({
                error: 'driver_id, date, quantity, and price_per_liter are required'
            });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        if (!isPositiveNumber(parseFloat(quantity))) {
            return res.status(400).json({ error: 'quantity must be a positive number' });
        }

        if (!isPositiveNumber(parseFloat(price_per_liter))) {
            return res.status(400).json({ error: 'price_per_liter must be a positive number' });
        }

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Handle file upload with Vercel Blob
        let comprovante_abastecimento = null;
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `abastecimento-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            comprovante_abastecimento = url;
        }

        const abastecimento = await Abastecimento.create({
            driver_id: parseInt(driver_id),
            date,
            quantity: parseFloat(quantity),
            price_per_liter: parseFloat(price_per_liter),
            comprovante_abastecimento
        });
        res.status(201).json(abastecimento);
    } catch (error) {
        console.error('Create abastecimento error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/admin/abastecimentos
 * List all abastecimentos with optional filters
 */
adminRouter.get('/', async (req, res) => {
    try {
        const filters = {
            driver_id: req.query.driver_id,
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const abastecimentos = await Abastecimento.findAll(filters);
        res.json(abastecimentos);
    } catch (error) {
        console.error('List abastecimentos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/abastecimentos/:id
 * Get abastecimento by ID
 */
adminRouter.get('/:id', async (req, res) => {
    try {
        const abastecimento = await Abastecimento.findById(req.params.id);
        if (!abastecimento) {
            return res.status(404).json({ error: 'Abastecimento not found' });
        }
        res.json(abastecimento);
    } catch (error) {
        console.error('Get abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/abastecimentos/:id
 * Delete abastecimento
 */
adminRouter.delete('/:id', async (req, res) => {
    try {
        const abastecimento = await Abastecimento.findById(req.params.id);
        if (!abastecimento) {
            return res.status(404).json({ error: 'Abastecimento not found' });
        }

        await Abastecimento.delete(req.params.id);
        res.json({ message: 'Abastecimento deleted successfully' });
    } catch (error) {
        console.error('Delete abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/admin/abastecimentos/:id
 * Update abastecimento (for completing pending abastecimentos)
 */
adminRouter.put('/:id', upload.single('comprovante_abastecimento'), async (req, res) => {
    try {
        const abastecimentoId = parseInt(req.params.id);
        const abastecimento = await Abastecimento.findById(abastecimentoId);

        if (!abastecimento) {
            return res.status(404).json({ error: 'Abastecimento not found' });
        }

        const { driver_id, date, plate, quantity, price_per_liter, client } = req.body;
        const updateData = {};

        if (driver_id !== undefined) updateData.driver_id = parseInt(driver_id);
        if (date !== undefined) updateData.date = date;
        if (plate !== undefined) updateData.plate = plate;
        if (quantity !== undefined) updateData.quantity = parseFloat(quantity);
        if (price_per_liter !== undefined) updateData.price_per_liter = parseFloat(price_per_liter);
        if (client !== undefined) updateData.client = client;

        // Handle file upload with Vercel Blob
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `abastecimento-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            updateData.comprovante_abastecimento = url;
        }

        // If completing a pending abastecimento, set status to complete
        if (abastecimento.status === 'pending' && quantity && price_per_liter) {
            updateData.status = 'complete';
        }

        const updated = await Abastecimento.update(abastecimentoId, updateData);
        res.json(updated);
    } catch (error) {
        console.error('Update abastecimento error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// ============================================
// DRIVER ROUTES - /api/driver/abastecimentos
// ============================================
const driverRouter = express.Router();
driverRouter.use(requireDriver);

/**
 * GET /api/driver/abastecimentos
 * Get logged-in driver's abastecimentos
 */
driverRouter.get('/', async (req, res) => {
    try {
        const driverId = req.driver.id;
        const filters = {
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const abastecimentos = await Abastecimento.findByDriver(driverId, filters);
        const stats = await Abastecimento.getDriverStats(driverId);

        res.json({
            abastecimentos,
            stats
        });
    } catch (error) {
        console.error('Get driver abastecimentos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { adminRouter, driverRouter };
