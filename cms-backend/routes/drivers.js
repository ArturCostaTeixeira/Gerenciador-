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
        const { name, plate, cpf, password, phone, client, plates } = req.body;

        // Validate input - plate is now optional
        if (!name || !cpf || !password) {
            return res.status(400).json({
                error: 'Nome, CPF e senha são obrigatórios'
            });
        }

        // Validate plate format if provided
        let normalizedPlate = null;
        if (plate && plate.trim()) {
            if (!isValidPlate(plate)) {
                return res.status(400).json({
                    error: 'Formato de placa inválido. Use ABC-1234 ou ABC1D23'
                });
            }
            normalizedPlate = normalizePlate(plate);
        }

        // Validate and normalize plates array if provided
        let normalizedPlates = [];
        if (plates && Array.isArray(plates)) {
            for (const p of plates) {
                if (p && p.trim()) {
                    if (!isValidPlate(p)) {
                        return res.status(400).json({
                            error: `Formato de placa inválido: ${p}. Use ABC-1234 ou ABC1D23`
                        });
                    }
                    normalizedPlates.push(normalizePlate(p));
                }
            }
        }

        // If plate is provided but not in plates array, add it
        if (normalizedPlate && !normalizedPlates.includes(normalizedPlate)) {
            normalizedPlates.unshift(normalizedPlate);
        }

        // Check if CPF already exists
        const cpfClean = cpf.replace(/\D/g, '');
        const existingCpf = await Driver.findByCpf(cpfClean);
        if (existingCpf) {
            return res.status(409).json({ error: 'CPF já cadastrado' });
        }

        const driver = await Driver.create({
            name: name.trim(),
            plate: normalizedPlate || (normalizedPlates.length > 0 ? normalizedPlates[0] : null),
            plates: normalizedPlates,
            cpf: cpfClean,
            password,
            phone: phone ? phone.replace(/\D/g, '') : null,
            client: client ? client.trim() : null
        });

        // Remove password from response
        const { password: _, ...safeDriver } = driver;
        res.status(201).json(safeDriver);
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

        const { name, cpf, phone, plate, plates, price_per_km_ton, client, active } = req.body;
        const updates = {};

        if (name !== undefined) {
            updates.name = name.trim();
        }

        if (cpf !== undefined) {
            const cpfClean = cpf.replace(/\D/g, '');
            if (cpfClean.length === 11) {
                // Check if CPF belongs to another driver
                const existingCpf = await Driver.findByCpf(cpfClean);
                if (existingCpf && existingCpf.id !== parseInt(req.params.id)) {
                    return res.status(409).json({ error: 'CPF já cadastrado para outro motorista' });
                }
                updates.cpf = cpfClean;
            }
        }

        if (phone !== undefined) {
            updates.phone = phone ? phone.replace(/\D/g, '') : null;
        }

        if (plate !== undefined) {
            if (!isValidPlate(plate)) {
                return res.status(400).json({
                    error: 'Invalid plate format. Use ABC-1234 or ABC-1D23'
                });
            }
            const normalizedPlate = normalizePlate(plate);
            updates.plate = normalizedPlate;
        }

        if (plates !== undefined) {
            // Validate and normalize additional plates - pass array, model will stringify
            if (plates && Array.isArray(plates)) {
                const normalizedPlates = plates.map(p => normalizePlate(p)).filter(p => p);
                updates.plates = normalizedPlates; // Pass array, not JSON string
            } else {
                updates.plates = [];
            }
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

/**
 * PATCH /api/admin/drivers/:id/authenticate
 * Authenticate a driver (mark as verified by admin)
 */
router.patch('/:id/authenticate', async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const updated = await Driver.update(req.params.id, { authenticated: true });
        res.json({ message: 'Driver authenticated successfully', driver: updated });
    } catch (error) {
        console.error('Authenticate driver error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
