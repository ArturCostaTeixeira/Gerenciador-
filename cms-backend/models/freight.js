const { execute, query, queryOne } = require('../config/database');
const Driver = require('./driver');

const Freight = {
    /**
     * Create a new freight (full version with all data)
     * @param {Object} data - {driver_id, date, km, tons, price_per_km_ton, client, comprovante_carga, comprovante_descarga}
     * @returns {Object} - Created freight with calculated total_value
     */
    async create(data) {
        const { driver_id, date, km, tons, price_per_km_ton, price_per_km_ton_transportadora, client, plate, comprovante_carga, comprovante_descarga, comprovante_recebimento } = data;

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        // Calculate total value for driver: km * tons * price_per_km_ton
        const total_value = (km || 0) * (tons || 0) * (price_per_km_ton || 0);

        // Calculate total value for transportadora: km * tons * price_per_km_ton_transportadora
        const total_value_transportadora = (km || 0) * (tons || 0) * (price_per_km_ton_transportadora || 0);

        const result = await execute(`
            INSERT INTO freights (driver_id, date, km, tons, price_per_km_ton, price_per_km_ton_transportadora, total_value, total_value_transportadora, client, plate, comprovante_carga, comprovante_descarga, comprovante_recebimento, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')
        `, [
            driver_id,
            date,
            km || 0,
            tons || 0,
            price_per_km_ton || 0,
            price_per_km_ton_transportadora || 0,
            total_value,
            total_value_transportadora,
            client || null,
            plate || null,
            comprovante_carga || null,
            comprovante_descarga || null,
            comprovante_recebimento || null
        ]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Create a pending freight (from driver upload - only driver_id, date, and comprovante)
     * @param {Object} data - {driver_id, date, comprovante_carga}
     * @returns {Object} - Created freight (pending status)
     */
    async createPending(data) {
        const { driver_id, date, comprovante_carga } = data;

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        const result = await execute(`
            INSERT INTO freights (driver_id, date, km, tons, price_per_km_ton, total_value, client, comprovante_carga, comprovante_descarga, status)
            VALUES (?, ?, 0, 0, 0, 0, NULL, ?, NULL, 'pending')
        `, [driver_id, date, comprovante_carga || null]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Update freight (for admin to complete pending freights)
     * @param {number} id - Freight ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated freight
     */
    async update(id, data) {
        const { driver_id, plate, date, client, km, tons, price_per_km_ton, price_per_km_ton_transportadora, comprovante_carga, comprovante_descarga, comprovante_recebimento, documento_frete, status, paid } = data;

        const updates = [];
        const values = [];

        if (driver_id !== undefined) {
            updates.push('driver_id = ?');
            values.push(driver_id);
        }
        if (plate !== undefined) {
            updates.push('plate = ?');
            values.push(plate);
        }
        if (date !== undefined) {
            updates.push('date = ?');
            values.push(date);
        }
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
        if (price_per_km_ton_transportadora !== undefined) {
            updates.push('price_per_km_ton_transportadora = ?');
            values.push(price_per_km_ton_transportadora);
        }
        if (comprovante_carga !== undefined) {
            updates.push('comprovante_carga = ?');
            values.push(comprovante_carga);
        }
        if (comprovante_descarga !== undefined) {
            updates.push('comprovante_descarga = ?');
            values.push(comprovante_descarga);
        }
        if (comprovante_recebimento !== undefined) {
            updates.push('comprovante_recebimento = ?');
            values.push(comprovante_recebimento);
        }
        if (documento_frete !== undefined) {
            updates.push('documento_frete = ?');
            values.push(documento_frete);
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
        if (km !== undefined || tons !== undefined || price_per_km_ton !== undefined || price_per_km_ton_transportadora !== undefined) {
            const freight = await this.findById(id);
            const newKm = km !== undefined ? km : freight.km;
            const newTons = tons !== undefined ? tons : freight.tons;
            const newPrice = price_per_km_ton !== undefined ? price_per_km_ton : freight.price_per_km_ton;
            const newPriceTransp = price_per_km_ton_transportadora !== undefined ? price_per_km_ton_transportadora : freight.price_per_km_ton_transportadora;

            const total_value = newKm * newTons * (newPrice || 0);
            updates.push('total_value = ?');
            values.push(total_value);

            const total_value_transportadora = newKm * newTons * (newPriceTransp || 0);
            updates.push('total_value_transportadora = ?');
            values.push(total_value_transportadora);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await execute(`UPDATE freights SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Find freight by ID
     * @param {number} id - Freight ID
     * @returns {Object|null} - Freight or null
     */
    async findById(id) {
        return queryOne(`
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE f.id = ?
        `, [id]);
    },

    /**
     * Find freights by driver ID
     * @param {number} driverId - Driver ID
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of freights
     */
    async findByDriver(driverId, filters = {}) {
        let sql = 'SELECT * FROM freights WHERE driver_id = ?';
        const values = [driverId];

        if (filters.date_from) {
            sql += ' AND date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND date <= ?';
            values.push(filters.date_to);
        }

        sql += ' ORDER BY date DESC';
        return query(sql, values);
    },

    /**
     * Find all freights (for admin)
     * @param {Object} filters - {driver_id, date_from, date_to, status}
     * @returns {Array} - List of freights with driver info
     */
    async findAll(filters = {}) {
        let sql = `
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE 1=1
        `;
        const values = [];

        if (filters.driver_id) {
            sql += ' AND f.driver_id = ?';
            values.push(filters.driver_id);
        }
        if (filters.date_from) {
            sql += ' AND f.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND f.date <= ?';
            values.push(filters.date_to);
        }
        if (filters.status) {
            sql += ' AND f.status = ?';
            values.push(filters.status);
        }

        sql += ' ORDER BY f.date DESC, f.id DESC';
        return query(sql, values);
    },

    /**
     * Get freight statistics for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object} - Stats {total_freights, total_km, total_tons, total_value}
     */
    async getDriverStats(driverId) {
        return queryOne(`
            SELECT 
                COUNT(*) as total_freights,
                COALESCE(SUM(km), 0) as total_km,
                COALESCE(SUM(tons), 0) as total_tons,
                COALESCE(SUM(total_value), 0) as total_value
            FROM freights
            WHERE driver_id = ? AND status = 'complete'
        `, [driverId]);
    },

    /**
     * Get unpaid total for a driver (complete freights that are not paid)
     * @param {number} driverId - Driver ID
     * @returns {number} - Unpaid total value
     */
    async getUnpaidTotalByDriver(driverId) {
        const result = await queryOne(`
            SELECT COALESCE(SUM(total_value), 0) as unpaid_total
            FROM freights
            WHERE driver_id = ? AND status = 'complete' AND (paid = 0 OR paid IS NULL)
        `, [driverId]);
        return result ? result.unpaid_total || 0 : 0;
    },

    /**
     * Get paid total for a driver (complete freights that are paid)
     * @param {number} driverId - Driver ID
     * @returns {number} - Paid total value
     */
    async getPaidTotalByDriver(driverId) {
        const result = await queryOne(`
            SELECT COALESCE(SUM(total_value), 0) as paid_total
            FROM freights
            WHERE driver_id = ? AND status = 'complete' AND paid = 1
        `, [driverId]);
        return result ? result.paid_total || 0 : 0;
    },

    /**
     * Get unpaid totals for all drivers
     * @returns {Array} - Array of {driver_id, unpaid_total}
     */
    async getAllUnpaidTotals() {
        return query(`
            SELECT 
                driver_id,
                COALESCE(SUM(total_value), 0) as unpaid_total
            FROM freights
            WHERE status = 'complete' AND (paid = 0 OR paid IS NULL)
            GROUP BY driver_id
        `);
    },

    /**
     * Delete freight
     * @param {number} id - Freight ID
     * @returns {boolean} - Success
     */
    async delete(id) {
        // First delete related records to avoid foreign key constraints
        await execute('DELETE FROM comprovantes_carga WHERE assigned_freight_id = ?', [id]);
        await execute('DELETE FROM comprovantes_descarga WHERE assigned_freight_id = ?', [id]);

        // Now delete the freight
        const result = await execute('DELETE FROM freights WHERE id = ?', [id]);
        return result.changes > 0;
    }
};

module.exports = Freight;
