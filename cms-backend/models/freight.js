const db = require('../config/database');
const Driver = require('./driver');

const Freight = {
    /**
     * Create a new freight (full version with all data)
     * @param {Object} data - {driver_id, date, km, tons, price_per_km_ton, client, comprovante_carga, comprovante_descarga}
     * @returns {Object} - Created freight with calculated total_value
     */
    create(data) {
        const { driver_id, date, km, tons, price_per_km_ton, client, comprovante_carga, comprovante_descarga } = data;

        // Verify driver exists
        const driver = Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        // Calculate total value: km * tons * price_per_km_ton
        const total_value = (km || 0) * (tons || 0) * (price_per_km_ton || 0);

        const stmt = db.prepare(`
            INSERT INTO freights (driver_id, date, km, tons, price_per_km_ton, total_value, client, comprovante_carga, comprovante_descarga, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')
        `);
        const result = stmt.run(
            driver_id,
            date,
            km || 0,
            tons || 0,
            price_per_km_ton || 0,
            total_value,
            client || null,
            comprovante_carga || null,
            comprovante_descarga || null
        );
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Create a pending freight (from driver upload - only driver_id, date, and comprovante)
     * @param {Object} data - {driver_id, date, comprovante_carga}
     * @returns {Object} - Created freight (pending status)
     */
    createPending(data) {
        const { driver_id, date, comprovante_carga } = data;

        // Verify driver exists
        const driver = Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        const stmt = db.prepare(`
            INSERT INTO freights (driver_id, date, km, tons, price_per_km_ton, total_value, client, comprovante_carga, comprovante_descarga, status)
            VALUES (?, ?, 0, 0, 0, 0, NULL, ?, NULL, 'pending')
        `);
        const result = stmt.run(driver_id, date, comprovante_carga || null);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Update freight (for admin to complete pending freights)
     * @param {number} id - Freight ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated freight
     */
    update(id, data) {
        const { client, km, tons, price_per_km_ton, comprovante_carga, comprovante_descarga, status, paid } = data;

        const updates = [];
        const values = [];

        if (client !== undefined) {
            updates.push('client = ?');
            values.push(client);
        }
        if (km !== undefined) {
            updates.push('km = ?');
            values.push(km);
        }
        if (tons !== undefined) {
            updates.push('tons = ?');
            values.push(tons);
        }
        if (price_per_km_ton !== undefined) {
            updates.push('price_per_km_ton = ?');
            values.push(price_per_km_ton);
        }
        if (comprovante_carga !== undefined) {
            updates.push('comprovante_carga = ?');
            values.push(comprovante_carga);
        }
        if (comprovante_descarga !== undefined) {
            updates.push('comprovante_descarga = ?');
            values.push(comprovante_descarga);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (paid !== undefined) {
            updates.push('paid = ?');
            values.push(paid ? 1 : 0);
        }
        if (data.client_paid !== undefined) {
            updates.push('client_paid = ?');
            values.push(data.client_paid ? 1 : 0);
        }

        // Recalculate total_value if km, tons, or price changed
        if (km !== undefined || tons !== undefined || price_per_km_ton !== undefined) {
            const freight = this.findById(id);
            const newKm = km !== undefined ? km : freight.km;
            const newTons = tons !== undefined ? tons : freight.tons;
            const newPrice = price_per_km_ton !== undefined ? price_per_km_ton : freight.price_per_km_ton;
            const total_value = newKm * newTons * (newPrice || 0);
            updates.push('total_value = ?');
            values.push(total_value);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        const stmt = db.prepare(`UPDATE freights SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        return this.findById(id);
    },

    /**
     * Find freight by ID
     * @param {number} id - Freight ID
     * @returns {Object|null} - Freight or null
     */
    findById(id) {
        return db.prepare(`
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE f.id = ?
        `).get(id);
    },

    /**
     * Find freights by driver ID
     * @param {number} driverId - Driver ID
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of freights
     */
    findByDriver(driverId, filters = {}) {
        let query = 'SELECT * FROM freights WHERE driver_id = ?';
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
     * Find all freights (for admin)
     * @param {Object} filters - {driver_id, date_from, date_to, status}
     * @returns {Array} - List of freights with driver info
     */
    findAll(filters = {}) {
        let query = `
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE 1=1
        `;
        const values = [];

        if (filters.driver_id) {
            query += ' AND f.driver_id = ?';
            values.push(filters.driver_id);
        }
        if (filters.date_from) {
            query += ' AND f.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            query += ' AND f.date <= ?';
            values.push(filters.date_to);
        }
        if (filters.status) {
            query += ' AND f.status = ?';
            values.push(filters.status);
        }

        query += ' ORDER BY f.date DESC, f.id DESC';
        return db.prepare(query).all(...values);
    },

    /**
     * Get freight statistics for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object} - Stats {total_freights, total_km, total_tons, total_value}
     */
    getDriverStats(driverId) {
        return db.prepare(`
            SELECT 
                COUNT(*) as total_freights,
                COALESCE(SUM(km), 0) as total_km,
                COALESCE(SUM(tons), 0) as total_tons,
                COALESCE(SUM(total_value), 0) as total_value
            FROM freights
            WHERE driver_id = ? AND status = 'complete'
        `).get(driverId);
    },

    /**
     * Get unpaid total for a driver (complete freights that are not paid)
     * @param {number} driverId - Driver ID
     * @returns {number} - Unpaid total value
     */
    getUnpaidTotalByDriver(driverId) {
        const result = db.prepare(`
            SELECT COALESCE(SUM(total_value), 0) as unpaid_total
            FROM freights
            WHERE driver_id = ? AND status = 'complete' AND (paid = 0 OR paid IS NULL)
        `).get(driverId);
        return result.unpaid_total || 0;
    },

    /**
     * Get paid total for a driver (complete freights that are paid)
     * @param {number} driverId - Driver ID
     * @returns {number} - Paid total value
     */
    getPaidTotalByDriver(driverId) {
        const result = db.prepare(`
            SELECT COALESCE(SUM(total_value), 0) as paid_total
            FROM freights
            WHERE driver_id = ? AND status = 'complete' AND paid = 1
        `).get(driverId);
        return result.paid_total || 0;
    },

    /**
     * Get unpaid totals for all drivers
     * @returns {Array} - Array of {driver_id, unpaid_total}
     */
    getAllUnpaidTotals() {
        return db.prepare(`
            SELECT 
                driver_id,
                COALESCE(SUM(total_value), 0) as unpaid_total
            FROM freights
            WHERE status = 'complete' AND (paid = 0 OR paid IS NULL)
            GROUP BY driver_id
        `).all();
    },

    /**
     n* Delete freight
     * @param {number} id - Freight ID
     * @returns {boolean} - Success
     */
    delete(id) {
        const stmt = db.prepare('DELETE FROM freights WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
};

module.exports = Freight;
