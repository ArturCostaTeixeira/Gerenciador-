const db = require('../config/database');
const bcrypt = require('bcryptjs');

const Driver = {
    /**
     * Create a new driver
     * @param {Object} data - {name, plate, client, password, phone, cpf}
     * @returns {Object} - Created driver
     */
    create(data) {
        const { name, plate, price_per_km_ton, client, password, phone, cpf } = data;

        // Hash password if provided
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

        const stmt = db.prepare(`
            INSERT INTO drivers (name, plate, price_per_km_ton, client, password, phone, cpf)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(name, plate, price_per_km_ton || 0, client || null, hashedPassword, phone || null, cpf || null);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find driver by ID
     * @param {number} id - Driver ID
     * @returns {Object|null} - Driver or null
     */
    findById(id) {
        return db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    },

    /**
     * Find driver by name and plate (for login)
     * @param {string} name - Driver name
     * @param {string} plate - Driver plate
     * @returns {Object|null} - Driver or null
     */
    findByNameAndPlate(name, plate) {
        return db.prepare(`
            SELECT * FROM drivers 
            WHERE LOWER(name) = LOWER(?) AND UPPER(plate) = UPPER(?) AND active = 1
        `).get(name, plate);
    },

    /**
     * Find driver by plate
     * @param {string} plate - Driver plate
     * @returns {Object|null} - Driver or null
     */
    findByPlate(plate) {
        return db.prepare('SELECT * FROM drivers WHERE UPPER(plate) = UPPER(?)').get(plate);
    },

    /**
     * Find driver by CPF
     * @param {string} cpf - Driver CPF
     * @returns {Object|null} - Driver or null
     */
    findByCpf(cpf) {
        return db.prepare('SELECT * FROM drivers WHERE cpf = ?').get(cpf);
    },

    /**
     * Find driver by phone
     * @param {string} phone - Driver phone
     * @returns {Object|null} - Driver or null
     */
    findByPhone(phone) {
        return db.prepare('SELECT * FROM drivers WHERE phone = ?').get(phone);
    },

    /**
     * Get all drivers
     * @param {boolean} activeOnly - Filter active drivers only
     * @returns {Array} - List of drivers
     */
    findAll(activeOnly = false) {
        if (activeOnly) {
            return db.prepare('SELECT * FROM drivers WHERE active = 1 ORDER BY name').all();
        }
        return db.prepare('SELECT * FROM drivers ORDER BY name').all();
    },

    /**
     * Update driver
     * @param {number} id - Driver ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated driver or null
     */
    update(id, data) {
        const { name, plate, price_per_km_ton, client, active, phone, cpf } = data;
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (plate !== undefined) {
            updates.push('plate = ?');
            values.push(plate);
        }
        if (price_per_km_ton !== undefined) {
            updates.push('price_per_km_ton = ?');
            values.push(price_per_km_ton);
        }
        if (client !== undefined) {
            updates.push('client = ?');
            values.push(client);
        }
        if (active !== undefined) {
            updates.push('active = ?');
            values.push(active ? 1 : 0);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            values.push(phone);
        }
        if (cpf !== undefined) {
            updates.push('cpf = ?');
            values.push(cpf);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        const stmt = db.prepare(`UPDATE drivers SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        return this.findById(id);
    },

    /**
     * Deactivate driver (soft delete)
     * @param {number} id - Driver ID
     * @returns {boolean} - Success
     */
    deactivate(id) {
        const stmt = db.prepare('UPDATE drivers SET active = 0 WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    },

    /**
     * Verify driver password
     * @param {string} plate - Driver plate
     * @param {string} password - Plain text password
     * @returns {Object|null} - Driver if password matches, null otherwise
     */
    verifyPassword(plate, password) {
        const driver = this.findByPlate(plate);
        if (!driver) return null;

        // If driver has no password set, deny login
        if (!driver.password) return null;

        // Verify password
        if (!bcrypt.compareSync(password, driver.password)) return null;

        return driver;
    }
};

module.exports = Driver;
