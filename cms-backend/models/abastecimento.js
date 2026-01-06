const { execute, query, queryOne } = require('../config/database');
const Driver = require('./driver');

const Abastecimento = {
    /**
     * Create a new abastecimento (refueling record)
     * Automatically calculates total_value based on quantity and price_per_liter
     * @param {Object} data - {driver_id, date, quantity, price_per_liter, comprovante_abastecimento}
     * @returns {Object} - Created abastecimento with calculated total_value
     */
    async create(data) {
        const { driver_id, date, quantity, price_per_liter, comprovante_abastecimento } = data;

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        // Calculate total value: quantity * price_per_liter
        const total_value = quantity * price_per_liter;

        const result = await execute(`
            INSERT INTO abastecimentos (driver_id, date, quantity, price_per_liter, total_value, comprovante_abastecimento, status)
            VALUES (?, ?, ?, ?, ?, ?, 'complete')
        `, [driver_id, date, quantity, price_per_liter, total_value, comprovante_abastecimento || null]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Create a pending abastecimento (driver upload)
     * Only requires driver_id, date, and comprovante - admin completes the rest
     * @param {Object} data - {driver_id, date, comprovante_abastecimento}
     * @returns {Object} - Created pending abastecimento
     */
    async createPending(data) {
        const { driver_id, date, comprovante_abastecimento } = data;

        // Verify driver exists
        const driver = await Driver.findById(driver_id);
        if (!driver) {
            throw new Error('Driver not found');
        }

        const result = await execute(`
            INSERT INTO abastecimentos (driver_id, date, quantity, price_per_liter, total_value, comprovante_abastecimento, status)
            VALUES (?, ?, 0, 0, 0, ?, 'pending')
        `, [driver_id, date, comprovante_abastecimento || null]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Update abastecimento
     * @param {number} id - Abastecimento ID
     * @param {Object} data - Fields to update
     * @returns {Object} - Updated abastecimento
     */
    async update(id, data) {
        const { driver_id, date, plate, quantity, price_per_liter, comprovante_abastecimento, status, client } = data;
        const updates = [];
        const values = [];

        if (driver_id !== undefined) {
            updates.push('driver_id = ?');
            values.push(driver_id);
        }
        if (date !== undefined) {
            updates.push('date = ?');
            values.push(date);
        }
        if (plate !== undefined) {
            updates.push('plate = ?');
            values.push(plate);
        }
        if (quantity !== undefined) {
            updates.push('quantity = ?');
            values.push(quantity);
        }
        if (price_per_liter !== undefined) {
            updates.push('price_per_liter = ?');
            values.push(price_per_liter);
        }
        if (comprovante_abastecimento !== undefined) {
            updates.push('comprovante_abastecimento = ?');
            values.push(comprovante_abastecimento);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (client !== undefined) {
            updates.push('client = ?');
            values.push(client || null);
        }

        // Recalculate total_value if quantity or price changed
        if (quantity !== undefined || price_per_liter !== undefined) {
            const abastecimento = await this.findById(id);
            const newQuantity = quantity !== undefined ? quantity : abastecimento.quantity;
            const newPrice = price_per_liter !== undefined ? price_per_liter : abastecimento.price_per_liter;
            const total_value = newQuantity * newPrice;
            updates.push('total_value = ?');
            values.push(total_value);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await execute(`UPDATE abastecimentos SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Find abastecimento by ID
     * @param {number} id - Abastecimento ID
     * @returns {Object|null} - Abastecimento or null
     */
    async findById(id) {
        return queryOne(`
            SELECT a.*, d.name as driver_name, d.plate as driver_plate
            FROM abastecimentos a
            JOIN drivers d ON a.driver_id = d.id
            WHERE a.id = ?
        `, [id]);
    },

    /**
     * Find abastecimentos by driver ID
     * @param {number} driverId - Driver ID
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of abastecimentos
     */
    async findByDriver(driverId, filters = {}) {
        let sql = 'SELECT * FROM abastecimentos WHERE driver_id = ?';
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
     * Find all abastecimentos (for admin)
     * @param {Object} filters - {driver_id, date_from, date_to}
     * @returns {Array} - List of abastecimentos with driver info
     */
    async findAll(filters = {}) {
        let sql = `
            SELECT a.*, d.name as driver_name, d.plate as driver_plate
            FROM abastecimentos a
            JOIN drivers d ON a.driver_id = d.id
            WHERE 1=1
        `;
        const values = [];

        if (filters.driver_id) {
            sql += ' AND a.driver_id = ?';
            values.push(filters.driver_id);
        }
        if (filters.date_from) {
            sql += ' AND a.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND a.date <= ?';
            values.push(filters.date_to);
        }

        sql += ' ORDER BY a.date DESC';
        return query(sql, values);
    },

    /**
     * Get abastecimento statistics for a driver
     * @param {number} driverId - Driver ID
     * @returns {Object} - Stats {total_abastecimentos, total_liters, total_value}
     */
    async getDriverStats(driverId) {
        return queryOne(`
            SELECT 
                COUNT(*) as total_abastecimentos,
                COALESCE(SUM(quantity), 0) as total_liters,
                COALESCE(SUM(total_value), 0) as total_value
            FROM abastecimentos
            WHERE driver_id = ? AND status = 'complete'
        `, [driverId]);
    },

    /**
     * Delete abastecimento by ID
     * @param {number} id - Abastecimento ID
     * @returns {boolean} - Success
     */
    async delete(id) {
        // First delete related records to avoid foreign key constraints
        await execute('DELETE FROM comprovantes_abastecimento WHERE assigned_abastecimento_id = ?', [id]);

        // Now delete the abastecimento
        const result = await execute('DELETE FROM abastecimentos WHERE id = ?', [id]);
        return result.changes > 0;
    }
};

module.exports = Abastecimento;
