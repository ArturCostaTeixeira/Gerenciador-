/**
 * Driver Location Routes - Live tracking for freights
 * Allows drivers to update their GPS position while on delivery
 */

const express = require('express');
const router = express.Router();
const DriverLocation = require('../models/DriverLocation');
const Freight = require('../models/freight');
const { requireDriver } = require('../middleware/auth');

/**
 * POST /api/driver/location
 * Update driver's current GPS location
 * Body: { latitude, longitude, freight_id? }
 */
router.post('/location', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;
        const { latitude, longitude, freight_id } = req.body;

        // Validate coordinates
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        if (latitude < -90 || latitude > 90) {
            return res.status(400).json({ error: 'Invalid latitude (must be between -90 and 90)' });
        }

        if (longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: 'Invalid longitude (must be between -180 and 180)' });
        }

        // Update location
        const location = await DriverLocation.upsert(driverId, latitude, longitude, freight_id || null);

        res.json({
            success: true,
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                freight_id: location.freight_id,
                updated_at: location.updated_at
            }
        });
    } catch (error) {
        console.error('Error updating driver location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

/**
 * POST /api/driver/start-tracking/:freightId
 * Start tracking a specific freight (marks freight as being tracked)
 */
router.post('/start-tracking/:freightId', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;
        const freightId = parseInt(req.params.freightId);

        // Verify the freight exists and belongs to this driver
        const freight = await Freight.findById(freightId);
        if (!freight) {
            return res.status(404).json({ error: 'Freight not found' });
        }

        if (freight.driver_id !== driverId) {
            return res.status(403).json({ error: 'This freight does not belong to you' });
        }

        // Enable tracking on the freight
        await Freight.update(freightId, { tracking_enabled: 1 });

        // Update driver's location with this freight ID (if location exists)
        const existingLocation = await DriverLocation.getByDriver(driverId);
        if (existingLocation) {
            await DriverLocation.upsert(
                driverId,
                existingLocation.latitude,
                existingLocation.longitude,
                freightId
            );
        }

        res.json({
            success: true,
            message: 'Tracking started for freight',
            freight_id: freightId
        });
    } catch (error) {
        console.error('Error starting tracking:', error);
        res.status(500).json({ error: 'Failed to start tracking' });
    }
});

/**
 * POST /api/driver/stop-tracking
 * Stop tracking (clears the freight_id from location)
 */
router.post('/stop-tracking', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;

        // Get current location to find which freight was being tracked
        const location = await DriverLocation.getByDriver(driverId);
        if (location && location.freight_id) {
            // Disable tracking on the freight
            await Freight.update(location.freight_id, { tracking_enabled: 0 });
        }

        // Clear the freight from location
        await DriverLocation.clearFreight(driverId);

        res.json({
            success: true,
            message: 'Tracking stopped'
        });
    } catch (error) {
        console.error('Error stopping tracking:', error);
        res.status(500).json({ error: 'Failed to stop tracking' });
    }
});

/**
 * GET /api/driver/tracking-status
 * Get current tracking status for the driver
 */
router.get('/tracking-status', requireDriver, async (req, res) => {
    try {
        const driverId = req.driver.id;
        const location = await DriverLocation.getByDriver(driverId);

        if (!location || !location.freight_id) {
            return res.json({
                tracking: false,
                freight_id: null,
                location: null
            });
        }

        const freight = await Freight.findById(location.freight_id);

        res.json({
            tracking: true,
            freight_id: location.freight_id,
            freight: freight ? {
                id: freight.id,
                client: freight.client,
                date: freight.date,
                status: freight.status
            } : null,
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                updated_at: location.updated_at
            }
        });
    } catch (error) {
        console.error('Error getting tracking status:', error);
        res.status(500).json({ error: 'Failed to get tracking status' });
    }
});

module.exports = router;
