const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Initialize database (creates tables if not exist)
require('./config/database');

const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const { adminRouter: adminFreightRoutes, driverRouter: driverFreightRoutes } = require('./routes/freights');
const { adminRouter: adminAbastecimentoRoutes, driverRouter: driverAbastecimentoRoutes } = require('./routes/abastecimentos');
const { adminRouter: adminOutrosInsumoRoutes, driverRouter: driverOutrosInsumoRoutes } = require('./routes/outrosinsumos');
const paymentRoutes = require('./routes/payments');
const { requireDriver } = require('./middleware/auth');
const Driver = require('./models/driver');
const Freight = require('./models/freight');
const Abastecimento = require('./models/abastecimento');
const OutrosInsumo = require('./models/outrosinsumo');
const ComprovanteDescarga = require('./models/comprovanteDescarga');
const ComprovanteAbastecimento = require('./models/comprovanteAbastecimento');
const ComprovanteCarga = require('./models/comprovanteCarga');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for driver uploads
const driverUploadsDir = path.join(__dirname, 'public', 'uploads', 'driver-comprovantes');
if (!fs.existsSync(driverUploadsDir)) {
    fs.mkdirSync(driverUploadsDir, { recursive: true });
}

const driverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, driverUploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `driver-${req.driver.id}-${uniqueSuffix}${ext}`);
    }
});

const driverUpload = multer({
    storage: driverStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only .png and .jpg files are allowed!'));
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// Serve static files for frontend
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/drivers', driverRoutes);
app.use('/api/admin/freights', adminFreightRoutes);
app.use('/api/admin/abastecimentos', adminAbastecimentoRoutes);
app.use('/api/admin/outrosinsumos', adminOutrosInsumoRoutes);
app.use('/api/admin/payments', paymentRoutes);
app.use('/api/driver/freights', driverFreightRoutes);
app.use('/api/driver/abastecimentos', driverAbastecimentoRoutes);
app.use('/api/driver/outrosinsumos', driverOutrosInsumoRoutes);

// Driver profile route
app.get('/api/driver/profile', requireDriver, (req, res) => {
    try {
        const driver = Driver.findById(req.driver.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        // Don't expose price_per_km_ton to drivers
        const { price_per_km_ton, ...safeDriver } = driver;
        res.json(safeDriver);
    } catch (error) {
        console.error('Get driver profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Driver stats route (for dashboard summary cards)
app.get('/api/driver/stats', requireDriver, (req, res) => {
    try {
        const driverId = req.driver.id;

        const freightStats = Freight.getDriverStats(driverId);
        const abastecimentoStats = Abastecimento.getDriverStats(driverId);
        const outrosInsumoStats = OutrosInsumo.getDriverStats(driverId);

        // Get paid (received) total
        const totalReceived = Freight.getPaidTotalByDriver(driverId);

        const totalFreights = freightStats.total_value || 0;
        const totalAbastecimentos = abastecimentoStats.total_value || 0;
        const totalOutrosInsumos = outrosInsumoStats.total_value || 0;

        // New calculation: Total a Receber = Total Fretes - Total Recebido - Abastecimentos - Outros Insumos
        const totalToReceive = totalFreights - totalReceived - totalAbastecimentos - totalOutrosInsumos;

        res.json({
            freights: {
                count: freightStats.total_freights,
                total_km: freightStats.total_km,
                total_tons: freightStats.total_tons,
                total_value: totalFreights
            },
            abastecimentos: {
                count: abastecimentoStats.total_abastecimentos,
                total_liters: abastecimentoStats.total_liters,
                total_value: totalAbastecimentos
            },
            outrosInsumos: {
                count: outrosInsumoStats.total_outros_insumos,
                total_quantity: outrosInsumoStats.total_quantity,
                total_value: totalOutrosInsumos
            },
            total_received: totalReceived,
            total_to_receive: totalToReceive
        });
    } catch (error) {
        console.error('Get driver stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Driver payments endpoint - get payments received by this driver
const Payment = require('./models/payment');
app.get('/api/driver/payments', requireDriver, (req, res) => {
    try {
        const driverId = req.driver.id;
        const payments = Payment.findByDriver(driverId);
        res.json({ payments });
    } catch (error) {
        console.error('Get driver payments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Driver upload comprovante de carga/descarga
// Uploading comprovante_carga creates a new pending freight AND adds to pool
// Uploading comprovante_descarga adds to the pool for admin assignment
app.post('/api/driver/upload-comprovante', requireDriver, driverUpload.fields([
    { name: 'comprovante_carga', maxCount: 1 },
    { name: 'comprovante_descarga', maxCount: 1 }
]), (req, res) => {
    try {
        const driverId = req.driver.id;
        let uploadedFiles = {};
        let createdFreight = null;
        let createdComprovanteCarga = null;
        let createdComprovanteDescarga = null;

        if (req.files) {
            // If uploading comprovante_carga, create a new pending freight AND add to pool
            if (req.files['comprovante_carga'] && req.files['comprovante_carga'][0]) {
                const comprovantePath = '/uploads/driver-comprovantes/' + req.files['comprovante_carga'][0].filename;
                uploadedFiles.comprovante_carga = comprovantePath;

                const today = new Date().toISOString().split('T')[0];

                // Create a new pending freight with today's date
                createdFreight = Freight.createPending({
                    driver_id: driverId,
                    date: today,
                    comprovante_carga: comprovantePath
                });

                // Also add to pool for potential reassignment
                createdComprovanteCarga = ComprovanteCarga.create({
                    driver_id: driverId,
                    file_path: comprovantePath,
                    date: today
                });

                // Mark as assigned to the pending freight
                if (createdFreight && createdComprovanteCarga) {
                    const stmt = db.prepare(`
                        UPDATE comprovantes_carga SET assigned_freight_id = ? WHERE id = ?
                    `);
                    stmt.run(createdFreight.id, createdComprovanteCarga.id);
                }
            }

            // If uploading comprovante_descarga, add to the pool
            if (req.files['comprovante_descarga'] && req.files['comprovante_descarga'][0]) {
                const comprovantePath = '/uploads/driver-comprovantes/' + req.files['comprovante_descarga'][0].filename;
                uploadedFiles.comprovante_descarga = comprovantePath;

                // Add to pool with today's date
                const today = new Date().toISOString().split('T')[0];
                createdComprovanteDescarga = ComprovanteDescarga.create({
                    driver_id: driverId,
                    file_path: comprovantePath,
                    date: today
                });
            }
        }

        res.json({
            message: 'Comprovante uploaded successfully',
            files: uploadedFiles,
            freight: createdFreight,
            comprovante_carga: createdComprovanteCarga,
            comprovante_descarga: createdComprovanteDescarga
        });
    } catch (error) {
        console.error('Upload comprovante error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Driver upload comprovante de abastecimento
// Creates a pending abastecimento (like pending freight) for admin to complete
app.post('/api/driver/upload-comprovante-abastecimento', requireDriver, driverUpload.single('comprovante_abastecimento'), (req, res) => {
    try {
        const driverId = req.driver.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = '/uploads/driver-comprovantes/' + req.file.filename;
        const today = new Date().toISOString().split('T')[0];

        // Create a pending abastecimento with the comprovante
        const abastecimento = Abastecimento.createPending({
            driver_id: driverId,
            date: today,
            comprovante_abastecimento: filePath
        });

        // Also add to pool for tracking
        const comprovante = ComprovanteAbastecimento.create({
            driver_id: driverId,
            file_path: filePath,
            date: today
        });

        // Mark as assigned to this abastecimento
        if (abastecimento && comprovante) {
            const stmt = db.prepare(`
                UPDATE comprovantes_abastecimento SET assigned_abastecimento_id = ? WHERE id = ?
            `);
            stmt.run(abastecimento.id, comprovante.id);
        }

        res.json({
            message: 'Comprovante de abastecimento uploaded successfully',
            file: filePath,
            abastecimento,
            comprovante
        });
    } catch (error) {
        console.error('Upload comprovante abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin clients endpoint
const { requireAdmin } = require('./middleware/auth');

// ============================================
// Admin Comprovantes Descarga Pool Endpoints
// ============================================

// Get all unassigned comprovantes descarga
app.get('/api/admin/comprovantes-descarga', requireAdmin, (req, res) => {
    try {
        const comprovantes = ComprovanteDescarga.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante to a freight
app.post('/api/admin/comprovantes-descarga/:id/assign', requireAdmin, (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { freight_id } = req.body;

        if (!freight_id) {
            return res.status(400).json({ error: 'freight_id is required' });
        }

        // First unassign any existing comprovante from this freight
        ComprovanteDescarga.unassignFromFreight(freight_id);

        // Assign the new comprovante
        const comprovante = ComprovanteDescarga.assignToFreight(comprovanteId, freight_id);

        if (!comprovante) {
            return res.status(404).json({ error: 'Comprovante not found or already assigned' });
        }

        res.json({
            message: 'Comprovante assigned successfully',
            comprovante
        });
    } catch (error) {
        console.error('Assign comprovante error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Unassign a comprovante from a freight
app.post('/api/admin/freights/:id/unassign-descarga', requireAdmin, (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        ComprovanteDescarga.unassignFromFreight(freightId);
        res.json({ message: 'Comprovante unassigned successfully' });
    } catch (error) {
        console.error('Unassign comprovante error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// Admin Comprovantes Carga Pool Endpoints
// ============================================

// Get all unassigned comprovantes carga
app.get('/api/admin/comprovantes-carga', requireAdmin, (req, res) => {
    try {
        const comprovantes = ComprovanteCarga.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes carga error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante carga to a freight
app.post('/api/admin/comprovantes-carga/:id/assign', requireAdmin, (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { freight_id } = req.body;

        if (!freight_id) {
            return res.status(400).json({ error: 'freight_id is required' });
        }

        // First unassign any existing comprovante carga from this freight
        ComprovanteCarga.unassignFromFreight(freight_id);

        // Assign the new comprovante
        const comprovante = ComprovanteCarga.assignToFreight(comprovanteId, freight_id);

        if (!comprovante) {
            return res.status(404).json({ error: 'Comprovante not found or already assigned' });
        }

        res.json({
            message: 'Comprovante assigned successfully',
            comprovante
        });
    } catch (error) {
        console.error('Assign comprovante carga error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Unassign a comprovante carga from a freight
app.post('/api/admin/freights/:id/unassign-carga', requireAdmin, (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        ComprovanteCarga.unassignFromFreight(freightId);
        res.json({ message: 'Comprovante carga unassigned successfully' });
    } catch (error) {
        console.error('Unassign comprovante carga error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// Admin Comprovantes Abastecimento Pool Endpoints
// ============================================

// Get all unassigned comprovantes abastecimento
app.get('/api/admin/comprovantes-abastecimento', requireAdmin, (req, res) => {
    try {
        const comprovantes = ComprovanteAbastecimento.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante abastecimento to an abastecimento
app.post('/api/admin/comprovantes-abastecimento/:id/assign', requireAdmin, (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { abastecimento_id } = req.body;

        if (!abastecimento_id) {
            return res.status(400).json({ error: 'abastecimento_id is required' });
        }

        // First unassign any existing comprovante from this abastecimento
        ComprovanteAbastecimento.unassignFromAbastecimento(abastecimento_id);

        // Assign the new comprovante
        const comprovante = ComprovanteAbastecimento.assignToAbastecimento(comprovanteId, abastecimento_id);

        if (!comprovante) {
            return res.status(404).json({ error: 'Comprovante not found or already assigned' });
        }

        res.json({
            message: 'Comprovante assigned successfully',
            comprovante
        });
    } catch (error) {
        console.error('Assign comprovante abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Unassign a comprovante from an abastecimento
app.post('/api/admin/abastecimentos/:id/unassign-comprovante', requireAdmin, (req, res) => {
    try {
        const abastecimentoId = parseInt(req.params.id);
        ComprovanteAbastecimento.unassignFromAbastecimento(abastecimentoId);
        res.json({ message: 'Comprovante unassigned successfully' });
    } catch (error) {
        console.error('Unassign comprovante abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/clients', requireAdmin, (req, res) => {
    try {
        // Get clients from both clients table and drivers table
        const clients = db.prepare(`
            SELECT 
                c.name as client,
                (SELECT COUNT(DISTINCT d.id) FROM drivers d WHERE d.client = c.name) as driver_count,
                (SELECT COUNT(*) FROM freights f WHERE f.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as freight_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM freights f WHERE f.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as total_freight_value,
                (SELECT COUNT(*) FROM abastecimentos a WHERE a.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as abastecimento_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM abastecimentos a WHERE a.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as total_abastecimento_value,
                (SELECT COUNT(*) FROM outros_insumos oi WHERE oi.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as outros_insumos_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM outros_insumos oi WHERE oi.driver_id IN (SELECT id FROM drivers WHERE client = c.name)) as total_outros_insumos_value
            FROM clients c
            UNION
            SELECT 
                d.client,
                COUNT(DISTINCT d.id) as driver_count,
                (SELECT COUNT(*) FROM freights f WHERE f.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as freight_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM freights f WHERE f.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as total_freight_value,
                (SELECT COUNT(*) FROM abastecimentos a WHERE a.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as abastecimento_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM abastecimentos a WHERE a.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as total_abastecimento_value,
                (SELECT COUNT(*) FROM outros_insumos oi WHERE oi.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as outros_insumos_count,
                (SELECT COALESCE(SUM(total_value), 0) FROM outros_insumos oi WHERE oi.driver_id IN (SELECT id FROM drivers WHERE client = d.client)) as total_outros_insumos_value
            FROM drivers d
            WHERE d.client IS NOT NULL AND d.client != '' AND d.client NOT IN (SELECT name FROM clients)
            GROUP BY d.client
            ORDER BY 1
        `).all();

        res.json(clients);
    } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create client endpoint
app.post('/api/admin/clients', requireAdmin, (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Client name is required' });
        }

        const trimmedName = name.trim();

        // Check if client already exists
        const existing = db.prepare('SELECT id FROM clients WHERE name = ?').get(trimmedName);
        if (existing) {
            return res.status(409).json({ error: 'Client already exists' });
        }

        // Also check in drivers table
        const existingInDrivers = db.prepare('SELECT DISTINCT client FROM drivers WHERE client = ?').get(trimmedName);
        if (existingInDrivers) {
            return res.status(409).json({ error: 'Client already exists (assigned to a driver)' });
        }

        const result = db.prepare('INSERT INTO clients (name) VALUES (?)').run(trimmedName);
        const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json(client);
    } catch (error) {
        console.error('Create client error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Client details endpoint
app.get('/api/admin/clients/:clientName', requireAdmin, (req, res) => {
    try {
        const clientName = decodeURIComponent(req.params.clientName);

        // Get drivers for this client
        const drivers = db.prepare(`
            SELECT * FROM drivers WHERE client = ? ORDER BY name
        `).all(clientName);

        if (drivers.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const driverIds = drivers.map(d => d.id);

        // Get freights for these drivers
        const freights = db.prepare(`
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE f.driver_id IN (${driverIds.join(',')})
            ORDER BY f.date DESC
        `).all();

        // Get abastecimentos for these drivers
        const abastecimentos = db.prepare(`
            SELECT a.*, d.name as driver_name, d.plate as driver_plate
            FROM abastecimentos a
            JOIN drivers d ON a.driver_id = d.id
            WHERE a.driver_id IN (${driverIds.join(',')})
            ORDER BY a.date DESC
        `).all();

        // Get outros insumos for these drivers
        const outrosInsumos = db.prepare(`
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE oi.driver_id IN (${driverIds.join(',')})
            ORDER BY oi.date DESC
        `).all();

        // Calculate totals
        const totalFreightValue = freights.reduce((sum, f) => sum + f.total_value, 0);
        const totalAbastecimentoValue = abastecimentos.reduce((sum, a) => sum + a.total_value, 0);
        const totalOutrosInsumosValue = outrosInsumos.reduce((sum, oi) => sum + oi.total_value, 0);

        res.json({
            client: clientName,
            drivers,
            freights,
            abastecimentos,
            outrosInsumos,
            stats: {
                driver_count: drivers.length,
                freight_count: freights.length,
                total_freight_value: totalFreightValue,
                abastecimento_count: abastecimentos.length,
                total_abastecimento_value: totalAbastecimentoValue,
                outros_insumos_count: outrosInsumos.length,
                total_outros_insumos_value: totalOutrosInsumosValue,
                total_to_receive: totalFreightValue - totalAbastecimentoValue - totalOutrosInsumosValue
            }
        });
    } catch (error) {
        console.error('Get client details error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// SPA fallback - serve appropriate index based on path
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint not found' });
    } else if (req.path.startsWith('/admin')) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     Carrier Management System - Backend API                ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║                                                            ║
║  Frontend: http://localhost:${PORT}                           ║
║                                                            ║
║  Default admin: admin / admin123                           ║
╚════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
