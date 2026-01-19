/**
 * Abastecedor Mobile Routes - Endpoints for Abastecedor mobile app
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Abastecedor = require('../models/abastecedor');
const Driver = require('../models/driver');
const Abastecimento = require('../models/abastecimento');
const OutrosInsumo = require('../models/outrosinsumo');
const { requireAbastecedor } = require('../middleware/auth');
const { uploadToBlob } = require('../utils/blobStorage');

// Configure multer with memory storage for Vercel Blob
const memoryStorage = multer.memoryStorage();

const upload = multer({
    storage: memoryStorage,
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

// All routes require abastecedor authentication
router.use(requireAbastecedor);

/**
 * GET /api/abastecedor/profile
 * Get logged-in abastecedor's profile
 */
router.get('/profile', async (req, res) => {
    try {
        const abastecedor = await Abastecedor.findById(req.abastecedor.id);
        if (!abastecedor) {
            return res.status(404).json({ error: 'Abastecedor not found' });
        }
        // Don't expose password
        const { password, ...safe } = abastecedor;
        res.json(safe);
    } catch (error) {
        console.error('Get abastecedor profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/abastecedor/drivers
 * Get all plates and associated drivers for plate selection
 */
router.get('/drivers', async (req, res) => {
    try {
        // Get all active drivers
        const drivers = await Driver.findAll({ authenticated: true });

        // Build plates map: plate -> drivers[]
        const platesMap = {};
        const driversList = [];

        for (const driver of drivers) {
            let plates = [];
            if (driver.plates) {
                try {
                    plates = JSON.parse(driver.plates);
                } catch (e) {
                    plates = driver.plate ? [driver.plate] : [];
                }
            } else if (driver.plate) {
                plates = [driver.plate];
            }

            for (const plate of plates) {
                if (!platesMap[plate]) {
                    platesMap[plate] = [];
                }
                platesMap[plate].push({
                    id: driver.id,
                    name: driver.name
                });

                driversList.push({
                    id: driver.id,
                    name: driver.name,
                    plate
                });
            }
        }

        // Convert to array format
        const platesArray = Object.keys(platesMap).map(plate => ({
            plate,
            drivers: platesMap[plate],
            multipleDrivers: platesMap[plate].length > 1
        }));

        res.json({
            plates: platesArray,
            drivers: driversList
        });
    } catch (error) {
        console.error('Get drivers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/abastecedor/validate-plate/:plate
 * Validate a plate and return associated driver(s)
 */
router.get('/validate-plate/:plate', async (req, res) => {
    try {
        const plate = req.params.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const drivers = await Driver.findAllByPlate(plate);

        if (!drivers || drivers.length === 0) {
            return res.json({ valid: false, message: 'Placa não encontrada' });
        }

        res.json({
            valid: true,
            driver: drivers[0], // First driver if multiple
            multipleDrivers: drivers.length > 1,
            drivers: drivers.map(d => ({ id: d.id, name: d.name }))
        });
    } catch (error) {
        console.error('Validate plate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/abastecedor/abastecimento
 * Submit a new abastecimento record
 */
router.post('/abastecimento', upload.single('comprovante'), async (req, res) => {
    try {
        const { driver_id, plate, date, liters } = req.body;

        // Validate input
        if (!driver_id || !date || !liters) {
            return res.status(400).json({
                error: 'driver_id, date, and liters are required'
            });
        }

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Handle file upload
        let comprovante_abastecimento = null;
        if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
            const filename = `abastecimento-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(req.file.buffer, filename, req.file.mimetype);
            comprovante_abastecimento = url;
        }

        // Create abastecimento (price_per_liter will be set by admin later)
        const abastecimento = await Abastecimento.create({
            driver_id: parseInt(driver_id),
            date,
            quantity: parseFloat(liters),
            price_per_liter: 0, // Pending - admin will fill
            plate: plate || null,
            comprovante_abastecimento,
            status: 'pending' // Pending admin review
        });

        res.status(201).json({
            success: true,
            message: 'Abastecimento registrado com sucesso',
            abastecimento
        });
    } catch (error) {
        console.error('Create abastecimento error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * POST /api/abastecedor/outros-insumos
 * Submit a new outros insumos record
 */
router.post('/outros-insumos', upload.single('comprovante'), async (req, res) => {
    try {
        const { driver_id, plate, date, quantity, description } = req.body;

        // Validate input
        if (!driver_id || !date || !quantity) {
            return res.status(400).json({
                error: 'driver_id, date, and quantity are required'
            });
        }

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Handle file upload
        let comprovante = null;
        if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
            const filename = `outros-insumos-${uniqueSuffix}${ext}`;
            const { url } = await uploadToBlob(req.file.buffer, filename, req.file.mimetype);
            comprovante = url;
        }

        // Create outros insumos (unit_price will be set by admin later)
        const outrosInsumo = await OutrosInsumo.create({
            driver_id: parseInt(driver_id),
            date,
            quantity: parseFloat(quantity),
            description: description || 'Outros Insumos',
            unit_price: 0, // Pending - admin will fill
            plate: plate || null,
            comprovante,
            status: 'pending' // Pending admin review
        });

        res.status(201).json({
            success: true,
            message: 'Outros Insumos registrado com sucesso',
            outrosInsumo
        });
    } catch (error) {
        console.error('Create outros insumo error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

module.exports = router;
