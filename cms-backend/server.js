const path = require('path');
const dotenvPath = path.join(__dirname, '.env');
console.log('Loading .env from:', dotenvPath);
const result = require('dotenv').config({ path: dotenvPath });
if (result.error) {
    console.error('dotenv ERROR:', result.error);
} else {
    console.log('dotenv loaded successfully. Keys:', Object.keys(result.parsed || {}).join(', '));
}
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

// Import database utilities
const { initDatabase, execute } = require('./config/database');
const { uploadToBlob } = require('./utils/blobStorage');

const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const { adminRouter: adminFreightRoutes, driverRouter: driverFreightRoutes } = require('./routes/freights');
const { adminRouter: adminAbastecimentoRoutes, driverRouter: driverAbastecimentoRoutes } = require('./routes/abastecimentos');
const { adminRouter: adminOutrosInsumoRoutes, driverRouter: driverOutrosInsumoRoutes } = require('./routes/outrosinsumos');
const paymentRoutes = require('./routes/payments');
const abastecedorRoutes = require('./routes/abastecedores');
const { requireDriver, requireAdmin, requireAbastecedor } = require('./middleware/auth');
const Driver = require('./models/driver');
const Freight = require('./models/freight');
const Abastecimento = require('./models/abastecimento');
const OutrosInsumo = require('./models/outrosinsumo');
const ComprovanteDescarga = require('./models/comprovanteDescarga');
const ComprovanteAbastecimento = require('./models/comprovanteAbastecimento');
const ComprovanteCarga = require('./models/comprovanteCarga');
const Payment = require('./models/payment');
const { query, queryOne } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer with memory storage for Vercel Blob
const memoryStorage = multer.memoryStorage();

const driverUpload = multer({
    storage: memoryStorage,
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

// Root route - serve landing page (must be before static middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Serve static files for frontend
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/drivers', driverRoutes);
app.use('/api/admin/freights', adminFreightRoutes);
app.use('/api/admin/abastecimentos', adminAbastecimentoRoutes);
app.use('/api/admin/outrosinsumos', adminOutrosInsumoRoutes);
app.use('/api/admin/payments', paymentRoutes);
app.use('/api/admin/abastecedores', abastecedorRoutes);
app.use('/api/driver/freights', driverFreightRoutes);
app.use('/api/driver/abastecimentos', driverAbastecimentoRoutes);
app.use('/api/driver/outrosinsumos', driverOutrosInsumoRoutes);

// Driver profile route
app.get('/api/driver/profile', requireDriver, async (req, res) => {
    try {
        const driver = await Driver.findById(req.driver.id);
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

// ============================================
// Driver Plate Management
// ============================================

const { isValidPlate, normalizePlate } = require('./utils/validators');

// Get driver's plates
app.get('/api/driver/plates', requireDriver, async (req, res) => {
    try {
        const driver = await Driver.findById(req.driver.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Parse plates JSON or return empty array
        let plates = [];
        if (driver.plates) {
            try {
                plates = JSON.parse(driver.plates);
            } catch (e) {
                plates = [];
            }
        }

        res.json({ plates });
    } catch (error) {
        console.error('Get driver plates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new plate
app.post('/api/driver/plates', requireDriver, async (req, res) => {
    try {
        const { plate } = req.body;

        if (!plate) {
            return res.status(400).json({ error: 'Placa é obrigatória' });
        }

        if (!isValidPlate(plate)) {
            return res.status(400).json({ error: 'Formato de placa inválido. Use ABC-1234 ou ABC-1D23' });
        }

        const normalizedPlate = normalizePlate(plate);

        const driver = await Driver.findById(req.driver.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Parse existing plates
        let plates = [];
        if (driver.plates) {
            try {
                plates = JSON.parse(driver.plates);
            } catch (e) {
                plates = [];
            }
        }

        // Check if plate already exists in driver's list
        if (plates.includes(normalizedPlate)) {
            return res.status(409).json({ error: 'Esta placa já está cadastrada' });
        }

        // Add new plate
        plates.push(normalizedPlate);

        // Update driver
        await Driver.update(req.driver.id, {
            plates: plates,
            plate: driver.plate || normalizedPlate // Set as primary if driver has no plate
        });

        res.status(201).json({
            message: 'Placa adicionada com sucesso',
            plates
        });
    } catch (error) {
        console.error('Add driver plate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove a plate
app.delete('/api/driver/plates/:plate', requireDriver, async (req, res) => {
    try {
        const plateToRemove = req.params.plate.toUpperCase();

        const driver = await Driver.findById(req.driver.id);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Parse existing plates
        let plates = [];
        if (driver.plates) {
            try {
                plates = JSON.parse(driver.plates);
            } catch (e) {
                plates = [];
            }
        }

        // Check if plate exists
        if (!plates.includes(plateToRemove)) {
            return res.status(404).json({ error: 'Placa não encontrada' });
        }

        // Remove plate
        plates = plates.filter(p => p !== plateToRemove);

        // Update driver
        const updateData = { plates: plates };

        // If removing the primary plate, set a new one or null
        if (driver.plate === plateToRemove) {
            updateData.plate = plates.length > 0 ? plates[0] : null;
        }

        await Driver.update(req.driver.id, updateData);

        res.json({
            message: 'Placa removida com sucesso',
            plates
        });
    } catch (error) {
        console.error('Remove driver plate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Driver stats route (for dashboard summary cards)
app.get('/api/driver/stats', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;

        const freightStats = await Freight.getDriverStats(driverId);
        const abastecimentoStats = await Abastecimento.getDriverStats(driverId);
        const outrosInsumoStats = await OutrosInsumo.getDriverStats(driverId);

        // Get paid (received) total
        const totalReceived = await Freight.getPaidTotalByDriver(driverId);

        const totalFreights = freightStats?.total_value || 0;
        const totalAbastecimentos = abastecimentoStats?.total_value || 0;
        const totalOutrosInsumos = outrosInsumoStats?.total_value || 0;

        // New calculation: Total a Receber = Total Fretes - Total Recebido - Abastecimentos - Outros Insumos
        const totalToReceive = totalFreights - totalReceived - totalAbastecimentos - totalOutrosInsumos;

        res.json({
            freights: {
                count: freightStats?.total_freights || 0,
                total_km: freightStats?.total_km || 0,
                total_tons: freightStats?.total_tons || 0,
                total_value: totalFreights
            },
            abastecimentos: {
                count: abastecimentoStats?.total_abastecimentos || 0,
                total_liters: abastecimentoStats?.total_liters || 0,
                total_value: totalAbastecimentos
            },
            outrosInsumos: {
                count: outrosInsumoStats?.total_outros_insumos || 0,
                total_quantity: outrosInsumoStats?.total_quantity || 0,
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
app.get('/api/driver/payments', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;
        const payments = await Payment.findByDriver(driverId);
        res.json({ payments });
    } catch (error) {
        console.error('Get driver payments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Driver upload comprovante de carga/descarga
app.post('/api/driver/upload-comprovante', requireDriver, driverUpload.fields([
    { name: 'comprovante_carga', maxCount: 1 },
    { name: 'comprovante_descarga', maxCount: 1 }
]), async (req, res) => {
    try {
        const driverId = req.driver.id;
        let uploadedFiles = {};
        let createdFreight = null;
        let createdComprovanteCarga = null;
        let createdComprovanteDescarga = null;

        if (req.files) {
            const today = new Date().toISOString().split('T')[0];

            // If uploading comprovante_carga, create a new pending freight AND add to pool
            if (req.files['comprovante_carga'] && req.files['comprovante_carga'][0]) {
                const file = req.files['comprovante_carga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `driver-${driverId}-carga-${uniqueSuffix}${ext}`;

                // Upload to Vercel Blob
                const { url: comprovantePath } = await uploadToBlob(file.buffer, filename, file.mimetype);
                uploadedFiles.comprovante_carga = comprovantePath;

                // Create a new pending freight with today's date
                createdFreight = await Freight.createPending({
                    driver_id: driverId,
                    date: today,
                    comprovante_carga: comprovantePath
                });

                // Also add to pool for potential reassignment
                createdComprovanteCarga = await ComprovanteCarga.create({
                    driver_id: driverId,
                    file_path: comprovantePath,
                    date: today
                });

                // Mark as assigned to the pending freight
                if (createdFreight && createdComprovanteCarga) {
                    await execute(`
                        UPDATE comprovantes_carga SET assigned_freight_id = ? WHERE id = ?
                    `, [createdFreight.id, createdComprovanteCarga.id]);
                }
            }

            // If uploading comprovante_descarga, add to the pool
            if (req.files['comprovante_descarga'] && req.files['comprovante_descarga'][0]) {
                const file = req.files['comprovante_descarga'][0];
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
                const filename = `driver-${driverId}-descarga-${uniqueSuffix}${ext}`;

                // Upload to Vercel Blob
                const { url: comprovantePath } = await uploadToBlob(file.buffer, filename, file.mimetype);
                uploadedFiles.comprovante_descarga = comprovantePath;

                // Add to pool with today's date
                createdComprovanteDescarga = await ComprovanteDescarga.create({
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
app.post('/api/driver/upload-comprovante-abastecimento', requireDriver, driverUpload.single('comprovante_abastecimento'), async (req, res) => {
    try {
        const driverId = req.driver.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.file;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const filename = `driver-${driverId}-abastecimento-${uniqueSuffix}${ext}`;

        // Upload to Vercel Blob
        const { url: filePath } = await uploadToBlob(file.buffer, filename, file.mimetype);
        const today = new Date().toISOString().split('T')[0];

        // Create a pending abastecimento with the comprovante
        const abastecimento = await Abastecimento.createPending({
            driver_id: driverId,
            date: today,
            comprovante_abastecimento: filePath
        });

        // Also add to pool for tracking
        const comprovante = await ComprovanteAbastecimento.create({
            driver_id: driverId,
            file_path: filePath,
            date: today
        });

        // Mark as assigned to this abastecimento
        if (abastecimento && comprovante) {
            await execute(`
                UPDATE comprovantes_abastecimento SET assigned_abastecimento_id = ? WHERE id = ?
            `, [abastecimento.id, comprovante.id]);
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

// ============================================
// Abastecedor Routes
// ============================================

// Abastecedor profile route
app.get('/api/abastecedor/profile', requireAbastecedor, async (req, res) => {
    try {
        const Abastecedor = require('./models/abastecedor');
        const abastecedor = await Abastecedor.findById(req.abastecedor.id);
        if (!abastecedor) {
            return res.status(404).json({ error: 'Abastecedor not found' });
        }
        // Don't expose password
        const { password, ...safeAbastecedor } = abastecedor;
        res.json(safeAbastecedor);
    } catch (error) {
        console.error('Get abastecedor profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Abastecedor: Submit abastecimento by plate or driver_id
app.post('/api/abastecedor/abastecimento', requireAbastecedor, driverUpload.single('comprovante'), async (req, res) => {
    try {
        const { plate, driver_id, date, liters } = req.body;

        // Validate input
        if ((!plate && !driver_id) || !date || !liters) {
            return res.status(400).json({ error: 'Placa (ou motorista), data e litros são obrigatórios' });
        }

        let driver;

        // If driver_id is provided, use it directly
        if (driver_id) {
            driver = await Driver.findById(parseInt(driver_id));
            if (!driver) {
                return res.status(404).json({ error: 'Motorista não encontrado' });
            }
        } else {
            // Find driver by plate - if multiple drivers, return error asking to select
            const drivers = await Driver.findAllByPlate(plate);
            if (drivers.length === 0) {
                return res.status(404).json({ error: 'Veículo não encontrado com esta placa' });
            }
            if (drivers.length > 1) {
                return res.status(400).json({
                    error: 'Múltiplos motoristas compartilham esta placa. Selecione um motorista.',
                    multipleDrivers: true,
                    drivers: drivers.map(d => ({ id: d.id, name: d.name }))
                });
            }
            driver = drivers[0];
        }

        let comprovantePath = null;

        // Handle file upload if provided
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `abastecedor-${req.abastecedor.id}-abast-${uniqueSuffix}${ext}`;

            // Upload to Vercel Blob
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            comprovantePath = url;
        }

        // Create the abastecimento with status 'complete' (since abastecedor provides liters)
        // Use default price per liter of 0 - admin will update
        const abastecimento = await Abastecimento.create({
            driver_id: driver.id,
            date: date,
            quantity: parseFloat(liters),
            price_per_liter: 0, // Admin will set the price later
            comprovante_abastecimento: comprovantePath
        });

        // Add comprovante to pool if provided
        if (comprovantePath) {
            const comprovante = await ComprovanteAbastecimento.create({
                driver_id: driver.id,
                file_path: comprovantePath,
                date: date
            });

            // Mark as assigned to this abastecimento
            if (abastecimento && comprovante) {
                await execute(`
                    UPDATE comprovantes_abastecimento SET assigned_abastecimento_id = ? WHERE id = ?
                `, [abastecimento.id, comprovante.id]);
            }
        }

        res.status(201).json({
            message: 'Abastecimento registrado com sucesso',
            abastecimento
        });
    } catch (error) {
        console.error('Abastecedor submit abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Abastecedor: Submit outros insumos by plate or driver_id
app.post('/api/abastecedor/outros-insumos', requireAbastecedor, driverUpload.single('comprovante'), async (req, res) => {
    try {
        const { plate, driver_id, date, quantity, description } = req.body;

        // Validate input
        if ((!plate && !driver_id) || !date || !quantity) {
            return res.status(400).json({ error: 'Placa (ou motorista), data e quantidade são obrigatórios' });
        }

        let driver;

        // If driver_id is provided, use it directly
        if (driver_id) {
            driver = await Driver.findById(parseInt(driver_id));
            if (!driver) {
                return res.status(404).json({ error: 'Motorista não encontrado' });
            }
        } else {
            // Find driver by plate - if multiple drivers, return error asking to select
            const drivers = await Driver.findAllByPlate(plate);
            if (drivers.length === 0) {
                return res.status(404).json({ error: 'Veículo não encontrado com esta placa' });
            }
            if (drivers.length > 1) {
                return res.status(400).json({
                    error: 'Múltiplos motoristas compartilham esta placa. Selecione um motorista.',
                    multipleDrivers: true,
                    drivers: drivers.map(d => ({ id: d.id, name: d.name }))
                });
            }
            driver = drivers[0];
        }

        let comprovantePath = null;

        // Handle file upload if provided
        if (req.file) {
            const file = req.file;
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `abastecedor-${req.abastecedor.id}-insumo-${uniqueSuffix}${ext}`;

            // Upload to Vercel Blob
            const { url } = await uploadToBlob(file.buffer, filename, file.mimetype);
            comprovantePath = url;
        }

        // Create the outros insumo with status 'complete'
        // Use default unit price of 0 - admin will update
        const outrosInsumo = await OutrosInsumo.create({
            driver_id: driver.id,
            date: date,
            quantity: parseFloat(quantity),
            description: description || 'Outros Insumos',
            unit_price: 0 // Admin will set the price later
        });

        res.status(201).json({
            message: 'Outros Insumos registrado com sucesso',
            outrosInsumo,
            comprovante: comprovantePath
        });
    } catch (error) {
        console.error('Abastecedor submit outros insumos error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Validate plate endpoint for abastecedor
app.get('/api/abastecedor/validate-plate/:plate', requireAbastecedor, async (req, res) => {
    try {
        const plate = req.params.plate.toUpperCase();
        const driver = await Driver.findByPlate(plate);

        if (!driver) {
            return res.json({ valid: false, message: 'Veículo não encontrado' });
        }

        res.json({
            valid: true,
            driver: {
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }
        });
    } catch (error) {
        console.error('Validate plate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Abastecedor: Get all drivers (for dropdown) - includes all plates
app.get('/api/abastecedor/drivers', requireAbastecedor, async (req, res) => {
    try {
        const drivers = await Driver.findAll(true); // Get active drivers only
        // Filter to only include authenticated drivers
        const authenticatedDrivers = drivers.filter(d => d.authenticated === 1 || d.authenticated === true);

        // Build a map of unique plates to drivers
        const plateDriversMap = new Map();

        authenticatedDrivers.forEach(d => {
            // Parse plates JSON
            let allPlates = [];
            if (d.plate) allPlates.push(d.plate);
            if (d.plates) {
                try {
                    const parsedPlates = JSON.parse(d.plates);
                    // Ensure parsedPlates is an array before spreading
                    if (Array.isArray(parsedPlates)) {
                        allPlates = [...new Set([...allPlates, ...parsedPlates])];
                    } else if (typeof parsedPlates === 'string' && parsedPlates.length > 2) {
                        // If it's a string (single plate), add it directly
                        allPlates = [...new Set([...allPlates, parsedPlates])];
                    }
                } catch (e) {
                    // If JSON parse fails, treat plates as a plain string (single plate)
                    if (typeof d.plates === 'string' && d.plates.length > 2) {
                        allPlates = [...new Set([...allPlates, d.plates])];
                    }
                }
            }

            // Add each plate to map
            allPlates.forEach(plate => {
                if (!plateDriversMap.has(plate)) {
                    plateDriversMap.set(plate, []);
                }
                plateDriversMap.get(plate).push({
                    id: d.id,
                    name: d.name
                });
            });
        });

        // Convert to array format for frontend
        const platesWithDrivers = [];
        plateDriversMap.forEach((drivers, plate) => {
            platesWithDrivers.push({
                plate,
                drivers,
                multipleDrivers: drivers.length > 1
            });
        });

        // Sort by plate
        platesWithDrivers.sort((a, b) => a.plate.localeCompare(b.plate));

        res.json({
            plates: platesWithDrivers,
            // Also include simple driver list for backward compatibility
            drivers: authenticatedDrivers.map(d => ({
                id: d.id,
                name: d.name,
                plate: d.plate
            }))
        });
    } catch (error) {
        console.error('Get abastecedor drivers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Abastecedor: Get drivers by plate (when multiple drivers share a plate)
app.get('/api/abastecedor/drivers-by-plate/:plate', requireAbastecedor, async (req, res) => {
    try {
        const plate = req.params.plate.toUpperCase();
        const drivers = await Driver.findAllByPlate(plate);

        if (drivers.length === 0) {
            return res.status(404).json({ error: 'Nenhum motorista encontrado com esta placa' });
        }

        res.json({
            plate,
            drivers: drivers.map(d => ({
                id: d.id,
                name: d.name
            })),
            multipleDrivers: drivers.length > 1
        });
    } catch (error) {
        console.error('Get drivers by plate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// ============================================
// Admin Comprovantes Descarga Pool Endpoints
// ============================================

// Get all unassigned comprovantes descarga
app.get('/api/admin/comprovantes-descarga', requireAdmin, async (req, res) => {
    try {
        const comprovantes = await ComprovanteDescarga.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante to a freight
app.post('/api/admin/comprovantes-descarga/:id/assign', requireAdmin, async (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { freight_id } = req.body;

        if (!freight_id) {
            return res.status(400).json({ error: 'freight_id is required' });
        }

        // First unassign any existing comprovante from this freight
        await ComprovanteDescarga.unassignFromFreight(freight_id);

        // Assign the new comprovante
        const comprovante = await ComprovanteDescarga.assignToFreight(comprovanteId, freight_id);

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
app.post('/api/admin/freights/:id/unassign-descarga', requireAdmin, async (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        await ComprovanteDescarga.unassignFromFreight(freightId);
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
app.get('/api/admin/comprovantes-carga', requireAdmin, async (req, res) => {
    try {
        const comprovantes = await ComprovanteCarga.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes carga error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante carga to a freight
app.post('/api/admin/comprovantes-carga/:id/assign', requireAdmin, async (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { freight_id } = req.body;

        if (!freight_id) {
            return res.status(400).json({ error: 'freight_id is required' });
        }

        // First unassign any existing comprovante carga from this freight
        await ComprovanteCarga.unassignFromFreight(freight_id);

        // Assign the new comprovante
        const comprovante = await ComprovanteCarga.assignToFreight(comprovanteId, freight_id);

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
app.post('/api/admin/freights/:id/unassign-carga', requireAdmin, async (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        await ComprovanteCarga.unassignFromFreight(freightId);
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
app.get('/api/admin/comprovantes-abastecimento', requireAdmin, async (req, res) => {
    try {
        const comprovantes = await ComprovanteAbastecimento.findUnassigned();
        res.json(comprovantes);
    } catch (error) {
        console.error('Get comprovantes abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Assign a comprovante abastecimento to an abastecimento
app.post('/api/admin/comprovantes-abastecimento/:id/assign', requireAdmin, async (req, res) => {
    try {
        const comprovanteId = parseInt(req.params.id);
        const { abastecimento_id } = req.body;

        if (!abastecimento_id) {
            return res.status(400).json({ error: 'abastecimento_id is required' });
        }

        // First unassign any existing comprovante from this abastecimento
        await ComprovanteAbastecimento.unassignFromAbastecimento(abastecimento_id);

        // Assign the new comprovante
        const comprovante = await ComprovanteAbastecimento.assignToAbastecimento(comprovanteId, abastecimento_id);

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
app.post('/api/admin/abastecimentos/:id/unassign-comprovante', requireAdmin, async (req, res) => {
    try {
        const abastecimentoId = parseInt(req.params.id);
        await ComprovanteAbastecimento.unassignFromAbastecimento(abastecimentoId);
        res.json({ message: 'Comprovante unassigned successfully' });
    } catch (error) {
        console.error('Unassign comprovante abastecimento error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin clients endpoint
app.get('/api/admin/clients', requireAdmin, async (req, res) => {
    try {
        // Get clients from both clients table and drivers table
        const clients = await query(`
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
        `);

        res.json(clients);
    } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create client endpoint
app.post('/api/admin/clients', requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Client name is required' });
        }

        const trimmedName = name.trim();

        // Check if client already exists
        const existing = await queryOne('SELECT id FROM clients WHERE name = ?', [trimmedName]);
        if (existing) {
            return res.status(409).json({ error: 'Client already exists' });
        }

        // Also check in drivers table
        const existingInDrivers = await queryOne('SELECT DISTINCT client FROM drivers WHERE client = ?', [trimmedName]);
        if (existingInDrivers) {
            return res.status(409).json({ error: 'Client already exists (assigned to a driver)' });
        }

        const result = await execute('INSERT INTO clients (name) VALUES (?)', [trimmedName]);
        const client = await queryOne('SELECT * FROM clients WHERE id = ?', [result.lastInsertRowid]);

        res.status(201).json(client);
    } catch (error) {
        console.error('Create client error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Client details endpoint
app.get('/api/admin/clients/:clientName', requireAdmin, async (req, res) => {
    try {
        const clientName = decodeURIComponent(req.params.clientName);

        // Get drivers for this client
        const drivers = await query(`
            SELECT * FROM drivers WHERE client = ? ORDER BY name
        `, [clientName]);

        if (drivers.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const driverIds = drivers.map(d => d.id);
        const driverIdList = driverIds.join(',');

        // Get freights for these drivers
        const freights = await query(`
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE f.driver_id IN (${driverIdList})
            ORDER BY f.date DESC
        `);

        // Get abastecimentos for these drivers
        const abastecimentos = await query(`
            SELECT a.*, d.name as driver_name, d.plate as driver_plate
            FROM abastecimentos a
            JOIN drivers d ON a.driver_id = d.id
            WHERE a.driver_id IN (${driverIdList})
            ORDER BY a.date DESC
        `);

        // Get outros insumos for these drivers
        const outrosInsumos = await query(`
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE oi.driver_id IN (${driverIdList})
            ORDER BY oi.date DESC
        `);

        // Calculate totals
        const totalFreightValue = freights.reduce((sum, f) => sum + (f.total_value || 0), 0);
        const totalAbastecimentoValue = abastecimentos.reduce((sum, a) => sum + (a.total_value || 0), 0);
        const totalOutrosInsumosValue = outrosInsumos.reduce((sum, oi) => sum + (oi.total_value || 0), 0);

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

// Landing page route
app.get('/landing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Driver portal route
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Abastecedor portal route
app.get('/abastecedor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'abastecedor.html'));
});

// SPA fallback - serve appropriate page based on path
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint not found' });
    } else if (req.path.startsWith('/admin')) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else if (req.path.startsWith('/abastecedor')) {
        res.sendFile(path.join(__dirname, 'public', 'abastecedor.html'));
    } else if (req.path === '/' || req.path === '') {
        // Root serves landing page
        res.sendFile(path.join(__dirname, 'public', 'landing.html'));
    } else {
        // Default: try to serve static file, or fallback to driver portal
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('Initializing Turso database...');
        await initDatabase();
        console.log('Database initialized successfully');

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
║  Database: Turso (libSQL)                                  ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
