const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const OutrosInsumo = require('../models/outrosinsumo');
const Driver = require('../models/driver');
const { requireAdmin, requireDriver } = require('../middleware/auth');
const { isValidDate, isPositiveNumber } = require('../utils/validators');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'outros-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg files are allowed'));
    }
});

// ============================================
// ADMIN ROUTES - /api/admin/outrosinsumos
// ============================================
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

/**
 * POST /api/admin/outrosinsumos
 * Create outros insumo for a driver (admin only)
 */
adminRouter.post('/', async (req, res) => {
    try {
        const { driver_id, date, quantity, description, unit_price, plate } = req.body;

        // Validate input
        if (!driver_id || !date || quantity === undefined || unit_price === undefined) {
            return res.status(400).json({
                error: 'driver_id, date, quantity, description, and unit_price are required'
            });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        if (!isPositiveNumber(quantity)) {
            return res.status(400).json({ error: 'quantity must be a positive number' });
        }

        if (!isPositiveNumber(unit_price)) {
            return res.status(400).json({ error: 'unit_price must be a positive number' });
        }

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const outrosInsumo = await OutrosInsumo.create({ driver_id, date, quantity, description: description || '', unit_price, plate: plate || null });
        res.status(201).json(outrosInsumo);
    } catch (error) {
        console.error('Create outros insumo error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/admin/outrosinsumos
 * List all outros insumos with optional filters
 */
adminRouter.get('/', async (req, res) => {
    try {
        const filters = {
            driver_id: req.query.driver_id,
            client: req.query.client,
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const outrosInsumos = await OutrosInsumo.findAll(filters);
        res.json(outrosInsumos);
    } catch (error) {
        console.error('List outros insumos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/outrosinsumos/:id
 * Get outros insumo by ID
 */
adminRouter.get('/:id', async (req, res) => {
    try {
        const outrosInsumo = await OutrosInsumo.findById(req.params.id);
        if (!outrosInsumo) {
            return res.status(404).json({ error: 'Outros insumo not found' });
        }
        res.json(outrosInsumo);
    } catch (error) {
        console.error('Get outros insumo error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/admin/outrosinsumos/:id
 * Update outros insumo with optional file upload
 */
adminRouter.put('/:id', upload.single('comprovante'), async (req, res) => {
    try {
        const outrosInsumo = await OutrosInsumo.findById(req.params.id);
        if (!outrosInsumo) {
            return res.status(404).json({ error: 'Outros insumo not found' });
        }

        const updateData = {};

        if (req.body.date !== undefined) {
            updateData.date = req.body.date;
        }
        if (req.body.quantity !== undefined) {
            updateData.quantity = parseFloat(req.body.quantity);
        }
        if (req.body.description !== undefined) {
            updateData.description = req.body.description;
        }
        if (req.body.unit_price !== undefined) {
            updateData.unit_price = parseFloat(req.body.unit_price);
        }
        if (req.body.plate !== undefined) {
            updateData.plate = req.body.plate || null;
        }

        // Calculate new total value if quantity or unit_price changed
        const quantity = updateData.quantity !== undefined ? updateData.quantity : outrosInsumo.quantity;
        const unit_price = updateData.unit_price !== undefined ? updateData.unit_price : outrosInsumo.unit_price;
        updateData.total_value = quantity * unit_price;

        // Handle file upload
        if (req.file) {
            updateData.comprovante = `/uploads/${req.file.filename}`;
        }

        const updated = await OutrosInsumo.update(req.params.id, updateData);
        res.json(updated);
    } catch (error) {
        console.error('Update outros insumo error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/outrosinsumos/:id
 * Delete outros insumo
 */
adminRouter.delete('/:id', async (req, res) => {
    try {
        const outrosInsumo = await OutrosInsumo.findById(req.params.id);
        if (!outrosInsumo) {
            return res.status(404).json({ error: 'Outros insumo not found' });
        }

        await OutrosInsumo.delete(req.params.id);
        res.json({ message: 'Outros insumo deleted successfully' });
    } catch (error) {
        console.error('Delete outros insumo error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// DRIVER ROUTES - /api/driver/outrosinsumos
// ============================================
const driverRouter = express.Router();
driverRouter.use(requireDriver);

/**
 * GET /api/driver/outrosinsumos
 * Get logged-in driver's outros insumos
 */
driverRouter.get('/', async (req, res) => {
    try {
        const driverId = req.driver.id;
        const filters = {
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const outrosInsumos = await OutrosInsumo.findByDriver(driverId, filters);
        const stats = await OutrosInsumo.getDriverStats(driverId);

        res.json({
            outrosInsumos,
            stats
        });
    } catch (error) {
        console.error('Get driver outros insumos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { adminRouter, driverRouter };
