const express = require('express');
const router = express.Router();
const Abastecedor = require('../models/abastecedor');
const { requireAdmin } = require('../middleware/auth');
const { isValidCPF } = require('../utils/validators');

// All routes require admin authentication
router.use(requireAdmin);

/**
 * POST /api/admin/abastecedores
 * Create a new abastecedor
 */
router.post('/', async (req, res) => {
    try {
        const { name, cpf, password, phone } = req.body;

        // Validate input
        if (!name || !cpf || !password) {
            return res.status(400).json({
                error: 'Nome, CPF e senha são obrigatórios'
            });
        }

        // Clean and validate CPF
        const cpfClean = cpf.replace(/\D/g, '');
        if (!isValidCPF(cpfClean)) {
            return res.status(400).json({
                error: 'CPF inválido'
            });
        }

        // Check if CPF already exists
        const existing = await Abastecedor.findByCpf(cpfClean);
        if (existing) {
            return res.status(409).json({ error: 'CPF já cadastrado' });
        }

        const abastecedor = await Abastecedor.create({
            name: name.trim(),
            cpf: cpfClean,
            password,
            phone: phone ? phone.replace(/\D/g, '') : null
        });

        // Remove password from response
        const { password: _, ...safeAbastecedor } = abastecedor;
        res.status(201).json(safeAbastecedor);
    } catch (error) {
        console.error('Create abastecedor error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/abastecedores
 * List all abastecedores
 */
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.active === 'true';
        const abastecedores = await Abastecedor.findAll(activeOnly);

        // Remove passwords from response
        const safeAbastecedores = abastecedores.map(a => {
            const { password, ...safe } = a;
            return safe;
        });

        res.json(safeAbastecedores);
    } catch (error) {
        console.error('List abastecedores error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/abastecedores/:id
 * Get abastecedor by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const abastecedor = await Abastecedor.findById(req.params.id);
        if (!abastecedor) {
            return res.status(404).json({ error: 'Abastecedor not found' });
        }

        const { password, ...safe } = abastecedor;
        res.json(safe);
    } catch (error) {
        console.error('Get abastecedor error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/admin/abastecedores/:id
 * Update abastecedor
 */
router.put('/:id', async (req, res) => {
    try {
        const abastecedor = await Abastecedor.findById(req.params.id);
        if (!abastecedor) {
            return res.status(404).json({ error: 'Abastecedor not found' });
        }

        const { name, cpf, phone, active } = req.body;
        const updates = {};

        if (name !== undefined) {
            updates.name = name.trim();
        }

        if (cpf !== undefined) {
            const cpfClean = cpf.replace(/\D/g, '');
            if (cpfClean.length === 11) {
                // Check if CPF belongs to another abastecedor
                const existingCpf = await Abastecedor.findByCpf(cpfClean);
                if (existingCpf && existingCpf.id !== parseInt(req.params.id)) {
                    return res.status(409).json({ error: 'CPF já cadastrado para outro abastecedor' });
                }
                updates.cpf = cpfClean;
            }
        }

        if (phone !== undefined) {
            updates.phone = phone ? phone.replace(/\D/g, '') : null;
        }

        if (active !== undefined) {
            updates.active = active;
        }

        const updated = await Abastecedor.update(req.params.id, updates);
        const { password, ...safe } = updated;
        res.json(safe);
    } catch (error) {
        console.error('Update abastecedor error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/abastecedores/:id
 * Deactivate abastecedor (soft delete)
 */
router.delete('/:id', async (req, res) => {
    try {
        const abastecedor = await Abastecedor.findById(req.params.id);
        if (!abastecedor) {
            return res.status(404).json({ error: 'Abastecedor not found' });
        }

        await Abastecedor.update(req.params.id, { active: false });
        res.json({ message: 'Abastecedor deactivated successfully' });
    } catch (error) {
        console.error('Delete abastecedor error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
