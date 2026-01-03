const db = require('../config/database');

const Payment = {
    /**
     * Create a new payment record
     * @param {Object} data - {driver_id, date_range, total_value, comprovante_path, freight_ids}
     * @returns {Object} - Created payment
     */
    create(data) {
        const { driver_id, date_range, total_value, comprovante_path, freight_ids } = data;

        const stmt = db.prepare(`
            INSERT INTO payments (driver_id, date_range, total_value, comprovante_path, freight_ids)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            driver_id,
            date_range,
            total_value,
            comprovante_path || null,
            JSON.stringify(freight_ids)
        );

        // Mark all associated freights as paid
        const markPaid = db.prepare(`UPDATE freights SET paid = 1 WHERE id = ?`);
        freight_ids.forEach(id => markPaid.run(id));

        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find payment by ID
     * @param {number} id - Payment ID
     * @returns {Object|null} - Payment or null
     */
    findById(id) {
        const payment = db.prepare(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            WHERE p.id = ?
        `).get(id);

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
    findByDriver(driverId) {
        const payments = db.prepare(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            WHERE p.driver_id = ?
            ORDER BY p.created_at DESC
        `).all(driverId);

        return payments.map(p => ({
            ...p,
            freight_ids: JSON.parse(p.freight_ids)
        }));
    },

    /**
     * Find all payments
     * @returns {Array} - List of all payments
     */
    findAll() {
        const payments = db.prepare(`
            SELECT p.*, d.name as driver_name, d.plate as driver_plate
            FROM payments p
            JOIN drivers d ON p.driver_id = d.id
            ORDER BY p.created_at DESC
        `).all();

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
    update(id, data) {
        const { comprovante_path } = data;
        const updates = [];
        const values = [];

        if (comprovante_path !== undefined) {
            updates.push('comprovante_path = ?');
            values.push(comprovante_path);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        db.prepare(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },

    /**
     * Delete payment and unmark associated freights
     * @param {number} id - Payment ID
     * @returns {boolean} - Success
     */
    delete(id) {
        const payment = this.findById(id);
        if (!payment) return false;

        // Unmark freights as paid
        const unmarkPaid = db.prepare(`UPDATE freights SET paid = 0 WHERE id = ?`);
        payment.freight_ids.forEach(fId => unmarkPaid.run(fId));

        const stmt = db.prepare('DELETE FROM payments WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
};

module.exports = Payment;
