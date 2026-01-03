const db = require('../config/database');
const Driver = require('./driver');

const OutrosInsumo = {
    /**
     * Create a new outros insumo record
     * Automatically calculates total_value based on quantity and unit_price
     * @param {Object} data - {driver_id, date, quantity, description, unit_price}
     * @returns {Object} - Created outros insumo with calculated total_value
     */
    create(data) {
        const { driver_id, date, quantity, description, unit_price } = data;

        // Verify driver exists
        const driver = Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        // Calculate total value: quantity * unit_price
        const total_value = quantity * unit_price;

        const stmt = db.prepare(`
            INSERT INTO outros_insumos (driver_id, date, quantity, description, unit_price, total_value)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(driver_id, date, quantity, description, unit_price, total_value);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find outros insumo by ID
     * @param {number} id - Outros insumo ID
     * @returns {Object|null} - Outros insumo or null
     */
    findById(id) {
        return db.prepare(`
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate, d.client as client
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE oi.id = ?
        `).get(id);
    },

    /**
     * Find outros insumos by driver ID
     * @param {number} driverId - Driver ID
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of outros insumos
     */
    findByDriver(driverId, filters = {}) {
        let query = 'SELECT * FROM outros_insumos WHERE driver_id = ?';
        const values = [driverId];

        if (filters.date_from) {
            query += ' AND date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            query += ' AND date <= ?';
            values.push(filters.date_to);
        }

        query += ' ORDER BY date DESC';
        return db.prepare(query).all(...values);
    },

    /**
     * Find all outros insumos (for admin)
     * @param {Object} filters - {driver_id, client, date_from, date_to}
     * @returns {Array} - List of outros insumos with driver info
     */
    findAll(filters = {}) {
        let query = `
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate, d.client as client
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE 1=1
        `;
        const values = [];

        if (filters.driver_id) {
            query += ' AND oi.driver_id = ?';
            values.push(filters.driver_id);
        }
        if (filters.client) {
            query += ' AND d.client = ?';
            values.push(filters.client);
        }
        if (filters.date_from) {
            query += ' AND oi.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            query += ' AND oi.date <= ?';
            values.push(filters.date_to);
        }

        query += ' ORDER BY oi.date DESC';
        return db.prepare(query).all(...values);
    },

    /**
     * Get outros insumos statistics for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object} - Stats {total_outros_insumos, total_quantity, total_value}
     */
    getDriverStats(driverId) {
        return db.prepare(`
            SELECT 
                COUNT(*) as total_outros_insumos,
                COALESCE(SUM(quantity), 0) as total_quantity,
                COALESCE(SUM(total_value), 0) as total_value
            FROM outros_insumos
            WHERE driver_id = ?
        `).get(driverId);
    },

    /**
     * Delete outros insumo by ID
     * @param {number} id - Outros insumo ID
     * @returns {boolean} - Success
     */
    delete(id) {
        const stmt = db.prepare('DELETE FROM outros_insumos WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
};

module.exports = OutrosInsumo;
