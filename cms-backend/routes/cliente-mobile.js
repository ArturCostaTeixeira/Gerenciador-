/**
 * Cliente Routes - Endpoints for Cliente mobile app
 */
const express = require('express');
const router = express.Router();
const Cliente = require('../models/cliente');
const Freight = require('../models/freight');
const { requireCliente } = require('../middleware/auth');

// All routes require cliente authentication
router.use(requireCliente);

/**
 * GET /api/cliente/profile
 * Get logged-in cliente's profile
 */
router.get('/profile', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.cliente.id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente not found' });
        }
        // Don't expose password
        const { password, ...safe } = cliente;
        res.json(safe);
    } catch (error) {
        console.error('Get cliente profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/cliente/freights
 * Get freights where client field matches this cliente's empresa
 */
router.get('/freights', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.cliente.id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente not found' });
        }

        const filters = {
            client: cliente.empresa || cliente.name,
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const freights = await Freight.findByClient(filters.client, {
            date_from: filters.date_from,
            date_to: filters.date_to
        });

        // Calculate stats
        const stats = {
            total_value: freights.reduce((sum, f) => sum + (f.km * f.tons * f.price_per_km_ton || 0), 0),
            total_km: freights.reduce((sum, f) => sum + (f.km || 0), 0),
            total_tons: freights.reduce((sum, f) => sum + (f.tons || 0), 0)
        };

        res.json({ freights, stats });
    } catch (error) {
        console.error('Get cliente freights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/cliente/stats
 * Get summary statistics for this cliente
 */
router.get('/stats', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.cliente.id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente not found' });
        }

        const clientName = cliente.empresa || cliente.name;
        const freights = await Freight.findByClient(clientName, {});

        res.json({
            total_freights: freights.length,
            total_value: freights.reduce((sum, f) => sum + (f.km * f.tons * f.price_per_km_ton || 0), 0),
            total_km: freights.reduce((sum, f) => sum + (f.km || 0), 0),
            total_tons: freights.reduce((sum, f) => sum + (f.tons || 0), 0)
        });
    } catch (error) {
        console.error('Get cliente stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/cliente/active-freights
 * Get pending freights that have tracking enabled (being delivered now)
 */
router.get('/active-freights', async (req, res) => {
    try {
        const cliente = await Cliente.findById(req.cliente.id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente not found' });
        }

        const clientName = cliente.empresa || cliente.name;

        // Get pending freights with tracking enabled for this client
        const DriverLocation = require('../models/DriverLocation');
        const { query } = require('../config/database');

        const activeFreights = await query(`
            SELECT f.*, d.name as driver_name, d.plate as driver_plate, d.phone as driver_phone,
                   dl.latitude, dl.longitude, dl.updated_at as location_updated_at
            FROM freights f
            JOIN drivers d ON d.id = f.driver_id
            LEFT JOIN driver_locations dl ON dl.freight_id = f.id
            WHERE LOWER(f.client) = LOWER(?)
              AND f.status = 'pending'
              AND f.tracking_enabled = 1
            ORDER BY f.date DESC
        `, [clientName]);

        res.json({
            active_freights: activeFreights.map(f => ({
                id: f.id,
                date: f.date,
                status: f.status,
                driver: {
                    name: f.driver_name,
                    plate: f.driver_plate,
                    phone: f.driver_phone
                },
                location: f.latitude ? {
                    latitude: f.latitude,
                    longitude: f.longitude,
                    updated_at: f.location_updated_at
                } : null
            }))
        });
    } catch (error) {
        console.error('Get active freights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/cliente/freight/:id/location
 * Get current location of driver for a specific freight
 */
router.get('/freight/:id/location', async (req, res) => {
    try {
        const freightId = parseInt(req.params.id);
        const cliente = await Cliente.findById(req.cliente.id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente not found' });
        }

        // Get the freight and verify it belongs to this cliente
        const freight = await Freight.findById(freightId);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        const clientName = cliente.empresa || cliente.name;
        if (freight.client?.toLowerCase() !== clientName?.toLowerCase()) {
            return res.status(403).json({ error: 'This freight does not belong to you' });
        }

        // Get driver location
        const DriverLocation = require('../models/DriverLocation');
        const location = await DriverLocation.getByFreight(freightId);

        if (!location) {
            return res.json({
                freight_id: freightId,
                tracking: false,
                location: null,
                message: 'Driver location not available'
            });
        }

        res.json({
            freight_id: freightId,
            tracking: true,
            driver: {
                name: location.driver_name,
                plate: location.driver_plate,
                phone: location.driver_phone
            },
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                updated_at: location.updated_at
            }
        });
    } catch (error) {
        console.error('Get freight location error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

