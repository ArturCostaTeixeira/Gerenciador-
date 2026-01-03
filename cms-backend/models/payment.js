const { execute, query, queryOne } = require('../config/database');

const Payment = {
    /**
     * Create a new payment record
     * @param {Object} data - {driver_id, date_range, total_value, comprovante_path, freight_ids}
     * @returns {Object} - Created payment
     */
    async create(data) {
        const { driver_id, date_range, total_value, comprovante_path, freight_ids } = data;

        const result = await execute(`
            INSERT INTO payments (driver_id, date_range, total_value, comprovante_path, freight_ids)
            VALUES (?, ?, ?, ?, ?)
        `, [
            driver_id,
            date_range,
            total_value,
            comprovante_path || null,
            JSON.stringify(freight_ids)
        ]);

        // Mark all associated freights as paid
        for (const id of freight_ids) {
            await execute(`UPDATE freights SET paid = 1 WHERE id = ?`, [id]);
        }

        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find payment by ID
     * @param {number} id - Payment ID
     * @returns {Object|null} - Payment or null
     */
    async findById(id) {
        const payment = await queryOne(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            WHERE p.id = ?
        `, [id]);

        if (payment) {
            payment.freight_ids = JSON.parse(payment.freight_ids);
        }
        return payment;
    },

    /**
     * Find all payments for a driver
     * @param {number} driverId - Driver ID
     * @returns {Array} - List of payments
     */
    async findByDriver(driverId) {
        const payments = await query(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            WHERE p.driver_id = ?
            ORDER BY p.created_at DESC
        `, [driverId]);

        return payments.map(p => ({
            ...p,
            freight_ids: JSON.parse(p.freight_ids)
        }));
    },

    /**
     * Find all payments
     * @returns {Array} - List of all payments
     */
    async findAll() {
        const payments = await query(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            ORDER BY p.created_at DESC
        `);

        return payments.map(p => ({
            ...p,
            freight_ids: JSON.parse(p.freight_ids)
        }));
    },

    /**
     * Update payment (e.g., to add comprovante after creation)
     * @param {number} id - Payment ID
     * @param {Object} data - Fields to update
     * @returns {Object} - Updated payment
     */
    async update(id, data) {
        const { comprovante_path } = data;
        const updates = [];
        const values = [];

        if (comprovante_path !== undefined) {
            updates.push('comprovante_path = ?');
            values.push(comprovante_path);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await execute(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Delete payment and unmark associated freights
     * @param {number} id - Payment ID
     * @returns {boolean} - Success
     */
    async delete(id) {
        const payment = await this.findById(id);
        if (!payment) return false;

        // Unmark freights as paid
        for (const fId of payment.freight_ids) {
            await execute(`UPDATE freights SET paid = 0 WHERE id = ?`, [fId]);
        }

        const result = await execute('DELETE FROM payments WHERE id = ?', [id]);
        return result.changes > 0;
    }
};

module.exports = Payment;
