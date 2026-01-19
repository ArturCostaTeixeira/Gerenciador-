/**
 * DriverLocation Model - Handles live location tracking for drivers
 * Used for real-time freight tracking by clients
 */

const { execute, query, queryOne } = require('../config/database');

const DriverLocation = {
    /**
     * Insert or update driver location
     * @param {number} driverId - Driver ID
     * @param {number} latitude - GPS latitude
     * @param {number} longitude - GPS longitude
     * @param {number|null} freightId - Optional freight ID being tracked
     * @returns {Object} - Location record
     */
    async upsert(driverId, latitude, longitude, freightId = null) {
        // Check if location exists for this driver
        const existing = await queryOne(
            'SELECT id FROM driver_locations WHERE driver_id = ?',
            [driverId]
        );

        if (existing) {
            // Update existing location
            await execute(
                `UPDATE driver_locations 
                 SET latitude = ?, longitude = ?, freight_id = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE driver_id = ?`,
                [latitude, longitude, freightId, driverId]
            );
        } else {
            // Insert new location
            await execute(
                `INSERT INTO driver_locations (driver_id, latitude, longitude, freight_id) 
                 VALUES (?, ?, ?, ?)`,
                [driverId, latitude, longitude, freightId]
            );
        }

        return this.getByDriver(driverId);
    },

    /**
     * Get latest location for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object|null} - Location record or null
     */
    async getByDriver(driverId) {
        return queryOne(
            'SELECT * FROM driver_locations WHERE driver_id = ?',
            [driverId]
        );
    },

    /**
     * Get location for a specific freight
     * @param {number} freightId - Freight ID
     * @returns {Object|null} - Location record with driver info or null
     */
    async getByFreight(freightId) {
        return queryOne(
            `SELECT dl.*, d.name as driver_name, d.plate as driver_plate, d.phone as driver_phone
             FROM driver_locations dl
             JOIN drivers d ON d.id = dl.driver_id
             WHERE dl.freight_id = ?`,
            [freightId]
        );
    },

    /**
     * Get all active locations (drivers currently tracking)
     * @returns {Array} - List of active locations with driver info
     */
    async getAllActive() {
        return query(
            `SELECT dl.*, d.name as driver_name, d.plate as driver_plate
             FROM driver_locations dl
             JOIN drivers d ON d.id = dl.driver_id
             WHERE dl.freight_id IS NOT NULL
             ORDER BY dl.updated_at DESC`
        );
    },

    /**
     * Clear location for a driver (stop tracking)
     * @param {number} driverId - Driver ID
     * @returns {boolean} - Success
     */
    async clearFreight(driverId) {
        const result = await execute(
            'UPDATE driver_locations SET freight_id = NULL WHERE driver_id = ?',
            [driverId]
        );
        return result.changes > 0;
    },

    /**
     * Delete location record for a driver
     * @param {number} driverId - Driver ID
     * @returns {boolean} - Success
     */
    async delete(driverId) {
        const result = await execute(
            'DELETE FROM driver_locations WHERE driver_id = ?',
            [driverId]
        );
        return result.changes > 0;
    }
};

module.exports = DriverLocation;
