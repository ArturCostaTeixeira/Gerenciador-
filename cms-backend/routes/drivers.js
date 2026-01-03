const express = require('express');
const router = express.Router();
const Driver = require('../models/driver');
const { requireAdmin } = require('../middleware/auth');
const { isValidPlate, normalizePlate, isPositiveNumber } = require('../utils/validators');

// All routes require admin authentication
router.use(requireAdmin);

/**
 * POST /api/admin/drivers
 * Create a new driver
 */
router.post('/', async (req, res) => {
    try {
        const { name, plate, price_per_km_ton, client } = req.body;

        // Validate input
        if (!name || !plate || price_per_km_ton === undefined) {
            return res.status(400).json({
                error: 'Name, plate, and price_per_km_ton are required'
            });
        }

        if (!isValidPlate(plate)) {
            return res.status(400).json({
                error: 'Invalid plate format. Use ABC-1234 or ABC-1D23'
            });
        }

        if (!isPositiveNumber(price_per_km_ton)) {
            return res.status(400).json({
                error: 'price_per_km_ton must be a positive number'
            });
        }

        // Check if plate already exists
        const normalizedPlate = normalizePlate(plate);
        const existing = await Driver.findByPlate(normalizedPlate);
        if (existing) {
            return res.status(409).json({ error: 'Plate already registered' });
        }

        const driver = await Driver.create({
            name: name.trim(),
            plate: normalizedPlate,
            price_per_km_ton,
            client: client ? client.trim() : null
        });

        res.status(201).json(driver);
    } catch (error) {
        console.error('Create driver error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/drivers
 * List all drivers
 */
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.active === 'true';
        const drivers = await Driver.findAll(activeOnly);
        res.json(drivers);
    } catch (error) {
        console.error('List drivers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/drivers/:id
 * Get driver by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.json(driver);
    } catch (error) {
        console.error('Get driver error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/admin/drivers/:id
 * Update driver
 */
router.put('/:id', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const { name, plate, price_per_km_ton, client, active } = req.body;
        const updates = {};

        if (name !== undefined) {
            updates.name = name.trim();
        }

        if (plate !== undefined) {
            if (!isValidPlate(plate)) {
                return res.status(400).json({
                    error: 'Invalid plate format. Use ABC-1234 or ABC-1D23'
                });
            }
            const normalizedPlate = normalizePlate(plate);
            // Check if plate belongs to another driver
            const existing = await Driver.findByPlate(normalizedPlate);
            if (existing && existing.id !== parseInt(req.params.id)) {
                return res.status(409).json({ error: 'Plate already registered to another driver' });
            }
            updates.plate = normalizedPlate;
        }

        if (price_per_km_ton !== undefined) {
            if (!isPositiveNumber(price_per_km_ton)) {
                return res.status(400).json({
                    error: 'price_per_km_ton must be a positive number'
                });
            }
            updates.price_per_km_ton = price_per_km_ton;
        }

        if (client !== undefined) {
            updates.client = client ? client.trim() : null;
        }

        if (active !== undefined) {
            updates.active = active;
        }

        const updated = await Driver.update(req.params.id, updates);
        res.json(updated);
    } catch (error) {
        console.error('Update driver error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/drivers/:id
 * Deactivate driver (soft delete)
 */
router.delete('/:id', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        await Driver.deactivate(req.params.id);
        res.json({ message: 'Driver deactivated successfully' });
    } catch (error) {
        console.error('Delete driver error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
