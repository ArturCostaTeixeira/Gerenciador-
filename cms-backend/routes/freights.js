const express = require('express');
const multer = require('multer');
const path = require('path');
const Freight = require('../models/freight');
const Driver = require('../models/driver');
const { requireAdmin, requireDriver } = require('../middleware/auth');
const { isValidDate, isPositiveNumber } = require('../utils/validators');
const { uploadToBlob } = require('../utils/blobStorage');

// Configure multer with memory storage for Vercel Blob
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Allow images for comprovantes
    const imageTypes = /jpeg|jpg|png/;
    const isImage = imageTypes.test(path.extname(file.originalname).toLowerCase()) && imageTypes.test(file.mimetype);

    // Allow PDF for documento_frete
    const isPdf = file.fieldname === 'documento_frete' &&
        (path.extname(file.originalname).toLowerCase() === '.pdf' || file.mimetype === 'application/pdf');

    if (isImage || isPdf) {
        return cb(null, true);
    }
    cb(new Error('Only .png, .jpg, and .pdf files are allowed!'));
};

const upload = multer({
    storage: memoryStorage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit for PDFs
});

// ============================================
// ADMIN ROUTES - /api/admin/freights
// ============================================
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

/**
 * POST /api/admin/freights
 * Create freight for a driver (admin only)
 */
adminRouter.post('/', upload.fields([
    { name: 'comprovante_carga', maxCount: 1 },
    { name: 'comprovante_descarga', maxCount: 1 },
    { name: 'comprovante_recebimento', maxCount: 1 }
]), async (req, res) => {
    try {
        const { driver_id, date, km, tons, price_per_km_ton, price_per_km_ton_transportadora, client } = req.body;

        // Validate input
        if (!driver_id || !date || km === undefined || tons === undefined || price_per_km_ton === undefined) {
            return res.status(400).json({
                error: 'driver_id, date, km, tons, and price_per_km_ton are required'
            });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        if (client && typeof client !== 'string') {
            return res.status(400).json({ error: 'client must be a string' });
        }

        if (!isPositiveNumber(parseFloat(km))) {
            return res.status(400).json({ error: 'km must be a positive number' });
        }

        if (!isPositiveNumber(parseFloat(tons))) {
            return res.status(400).json({ error: 'tons must be a positive number' });
        }

        if (!isPositiveNumber(parseFloat(price_per_km_ton))) {
            return res.status(400).json({ error: 'price_per_km_ton must be a positive number' });
        }

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Handle file uploads with Vercel Blob
        let comprovante_carga = null;
        let comprovante_descarga = null;
        let comprovante_recebimento = null;

        if (req.files) {
            if (req.files['comprovante_carga'] && req.files['comprovante_carga'][0]) {
                const file = req.files['comprovante_carga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-carga-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                comprovante_carga = url;
            }
            if (req.files['comprovante_descarga'] && req.files['comprovante_descarga'][0]) {
                const file = req.files['comprovante_descarga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-descarga-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                comprovante_descarga = url;
            }
            if (req.files['comprovante_recebimento'] && req.files['comprovante_recebimento'][0]) {
                const file = req.files['comprovante_recebimento'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-recebimento-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                comprovante_recebimento = url;
            }
        }

        const freight = await Freight.create({
            driver_id: parseInt(driver_id),
            date,
            km: parseFloat(km),
            tons: parseFloat(tons),
            price_per_km_ton: parseFloat(price_per_km_ton),
            price_per_km_ton_transportadora: price_per_km_ton_transportadora ? parseFloat(price_per_km_ton_transportadora) : null,
            client: client ? client.trim() : null,
            comprovante_carga,
            comprovante_descarga,
            comprovante_recebimento
        });
        res.status(201).json(freight);
    } catch (error) {
        console.error('Create freight error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * PUT /api/admin/freights/:id
 * Update freight (for completing pending freights)
 */
adminRouter.put('/:id', upload.fields([
    { name: 'comprovante_carga', maxCount: 1 },
    { name: 'comprovante_descarga', maxCount: 1 },
    { name: 'comprovante_recebimento', maxCount: 1 },
    { name: 'documento_frete', maxCount: 1 }
]), async (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        const freight = await Freight.findById(freightId);

        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        const { driver_id, date, client, km, tons, price_per_km_ton, price_per_km_ton_transportadora, status, plate } = req.body;
        const updateData = {};

        if (driver_id !== undefined) updateData.driver_id = parseInt(driver_id);
        if (date !== undefined) updateData.date = date;
        if (client !== undefined) updateData.client = client;
        if (plate !== undefined) updateData.plate = plate;
        if (km !== undefined) updateData.km = parseFloat(km);
        if (tons !== undefined) updateData.tons = parseFloat(tons);
        if (price_per_km_ton !== undefined) updateData.price_per_km_ton = parseFloat(price_per_km_ton);
        if (price_per_km_ton_transportadora !== undefined) updateData.price_per_km_ton_transportadora = parseFloat(price_per_km_ton_transportadora);
        if (status !== undefined) updateData.status = status;

        // Handle file uploads with Vercel Blob
        if (req.files) {
            if (req.files['comprovante_carga'] && req.files['comprovante_carga'][0]) {
                const file = req.files['comprovante_carga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-carga-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                updateData.comprovante_carga = url;
            }
            if (req.files['comprovante_descarga'] && req.files['comprovante_descarga'][0]) {
                const file = req.files['comprovante_descarga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-descarga-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                updateData.comprovante_descarga = url;
            }
            if (req.files['comprovante_recebimento'] && req.files['comprovante_recebimento'][0]) {
                const file = req.files['comprovante_recebimento'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `freight-recebimento-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                updateData.comprovante_recebimento = url;
            }
            if (req.files['documento_frete'] && req.files['documento_frete'][0]) {
                const file = req.files['documento_frete'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
                const filename = `freight-documento-${uniqueSuffix}${ext}`;
                const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
                updateData.documento_frete = url;
            }
        }

        // If all required fields are filled, mark as complete
        const updatedKm = updateData.km !== undefined ? updateData.km : freight.km;
        const updatedTons = updateData.tons !== undefined ? updateData.tons : freight.tons;
        const updatedPrice = updateData.price_per_km_ton !== undefined ? updateData.price_per_km_ton : freight.price_per_km_ton;
        const updatedClient = updateData.client !== undefined ? updateData.client : freight.client;

        if (updatedKm > 0 && updatedTons > 0 && updatedPrice > 0 && updatedClient) {
            updateData.status = 'complete';
        }

        const updatedFreight = await Freight.update(freightId, updateData);
        res.json(updatedFreight);
    } catch (error) {
        console.error('Update freight error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/admin/freights
 * List all freights with optional filters
 */
adminRouter.get('/', async (req, res) => {
    try {
        const filters = {
            driver_id: req.query.driver_id,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            status: req.query.status
        };

        const freights = await Freight.findAll(filters);
        res.json(freights);
    } catch (error) {
        console.error('List freights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/freights/unpaid-totals
 * Get unpaid totals for all drivers
 * NOTE: This must be defined BEFORE /:id route
 */
adminRouter.get('/unpaid-totals', async (req, res) => {
    try {
        const unpaidTotals = await Freight.getAllUnpaidTotals();
        res.json(unpaidTotals);
    } catch (error) {
        console.error('Get unpaid totals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/freights/:id
 * Get freight by ID
 */
adminRouter.get('/:id', async (req, res) => {
    try {
        const freight = await Freight.findById(req.params.id);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }
        res.json(freight);
    } catch (error) {
        console.error('Get freight error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/freights/:id
 * Delete freight
 */
adminRouter.delete('/:id', async (req, res) => {
    try {
        const freight = await Freight.findById(req.params.id);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        await Freight.delete(req.params.id);
        res.json({ message: 'Freight deleted successfully' });
    } catch (error) {
        console.error('Delete freight error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /api/admin/freights/:id/toggle-paid
 * Toggle paid status for a freight (payment TO driver)
 */
adminRouter.patch('/:id/toggle-paid', async (req, res) => {
    try {
        const freight = await Freight.findById(req.params.id);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        const newPaidStatus = !freight.paid;
        const updated = await Freight.update(req.params.id, { paid: newPaidStatus });
        res.json(updated);
    } catch (error) {
        console.error('Toggle paid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /api/admin/freights/:id/toggle-client-paid
 * Toggle client_paid status for a freight (payment FROM client)
 */
adminRouter.patch('/:id/toggle-client-paid', async (req, res) => {
    try {
        const freight = await Freight.findById(req.params.id);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        const newClientPaidStatus = !freight.client_paid;
        const updated = await Freight.update(req.params.id, { client_paid: newClientPaidStatus });
        res.json(updated);
    } catch (error) {
        console.error('Toggle client paid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ============================================
// DRIVER ROUTES - /api/driver/freights
// ============================================
const driverRouter = express.Router();
driverRouter.use(requireDriver);

/**
 * GET /api/driver/freights
 * Get logged-in driver's freights
 */
driverRouter.get('/', async (req, res) => {
    try {
        const driverId = req.driver.id;
        const filters = {
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const freights = await Freight.findByDriver(driverId, filters);
        const stats = await Freight.getDriverStats(driverId);

        res.json({
            freights,
            stats
        });
    } catch (error) {
        console.error('Get driver freights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { adminRouter, driverRouter };
