const { execute, query, queryOne } = require('../config/database');
const Driver = require('./driver');

const OutrosInsumo = {
    /**
     * Create a new outros insumo record
     * Automatically calculates total_value based on quantity and unit_price
     * @param {Object} data - {driver_id, date, quantity, description, unit_price}
     * @returns {Object} - Created outros insumo with calculated total_value
     */
    async create(data) {
        const { driver_id, date, quantity, description, unit_price } = data;

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        // Calculate total value: quantity * unit_price
        const total_value = quantity * unit_price;

        const result = await execute(`
            INSERT INTO outros_insumos (driver_id, date, quantity, description, unit_price, total_value)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [driver_id, date, quantity, description, unit_price, total_value]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find outros insumo by ID
     * @param {number} id - Outros insumo ID
     * @returns {Object|null} - Outros insumo or null
     */
    async findById(id) {
        return queryOne(`
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate, d.client as client
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE oi.id = ?
        `, [id]);
    },

    /**
     * Find outros insumos by driver ID
     * @param {number} driverId - Driver ID
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of outros insumos
     */
    async findByDriver(driverId, filters = {}) {
        let sql = 'SELECT * FROM outros_insumos WHERE driver_id = ?';
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
     * Find all outros insumos (for admin)
     * @param {Object} filters - {driver_id, client, date_from, date_to}
     * @returns {Array} - List of outros insumos with driver info
     */
    async findAll(filters = {}) {
        let sql = `
            SELECT oi.*, d.name as driver_name, d.plate as driver_plate, d.client as client
            FROM outros_insumos oi
            JOIN drivers d ON oi.driver_id = d.id
            WHERE 1=1
        `;
        const values = [];

        if (filters.driver_id) {
            sql += ' AND oi.driver_id = ?';
            values.push(filters.driver_id);
        }
        if (filters.client) {
            sql += ' AND d.client = ?';
            values.push(filters.client);
        }
        if (filters.date_from) {
            sql += ' AND oi.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND oi.date <= ?';
            values.push(filters.date_to);
        }

        sql += ' ORDER BY oi.date DESC';
        return query(sql, values);
    },

    /**
     * Get outros insumos statistics for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object} - Stats {total_outros_insumos, total_quantity, total_value}
     */
    async getDriverStats(driverId) {
        return queryOne(`
            SELECT 
                COUNT(*) as total_outros_insumos,
                COALESCE(SUM(quantity), 0) as total_quantity,
                COALESCE(SUM(total_value), 0) as total_value
            FROM outros_insumos
            WHERE driver_id = ?
        `, [driverId]);
    },

    /**
     * Update outros insumo by ID
     * @param {number} id - Outros insumo ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated outros insumo or null
     */
    async update(id, data) {
        const { date, quantity, description, unit_price, total_value, comprovante } = data;
        const updates = [];
        const values = [];

        if (date !== undefined) {
            updates.push('date = ?');
            values.push(date);
        }
        if (quantity !== undefined) {
            updates.push('quantity = ?');
            values.push(quantity);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (unit_price !== undefined) {
            updates.push('unit_price = ?');
            values.push(unit_price);
        }
        if (total_value !== undefined) {
            updates.push('total_value = ?');
            values.push(total_value);
        }
        if (comprovante !== undefined) {
            updates.push('comprovante = ?');
            values.push(comprovante);
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        await execute(`UPDATE outros_insumos SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Delete outros insumo by ID
     * @param {number} id - Outros insumo ID
     * @returns {boolean} - Success
     */
    async delete(id) {
        const result = await execute('DELETE FROM outros_insumos WHERE id = ?', [id]);
        return result.changes > 0;
    }
};

module.exports = OutrosInsumo;
