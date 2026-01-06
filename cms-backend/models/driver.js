const { execute, query, queryOne } = require('../config/database');
const bcrypt = require('bcryptjs');

const Driver = {
    /**
     * Create a new driver
     * @param {Object} data - {name, plate, plates, client, password, phone, cpf}
     * @returns {Object} - Created driver
     */
    async create(data) {
        const { name, plate, plates, price_per_km_ton, client, password, phone, cpf } = data;

        // Hash password if provided
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

        // Store plates as JSON string if provided
        const platesJson = plates && plates.length > 0 ? JSON.stringify(plates) : null;

        const result = await execute(`
            INSERT INTO drivers (name, plate, plates, price_per_km_ton, client, password, phone, cpf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, plate, platesJson, price_per_km_ton || 0, client || null, hashedPassword, phone || null, cpf || null]);

        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find driver by ID
     * @param {number} id - Driver ID
     * @returns {Object|null} - Driver or null
     */
    async findById(id) {
        return queryOne('SELECT * FROM drivers WHERE id = ?', [id]);
    },

    /**
     * Find driver by name and plate (for login)
     * @param {string} name - Driver name
     * @param {string} plate - Driver plate
     * @returns {Object|null} - Driver or null
     */
    async findByNameAndPlate(name, plate) {
        return queryOne(`
            SELECT * FROM drivers 
            WHERE LOWER(name) = LOWER(?) AND UPPER(plate) = UPPER(?) AND active = 1
        `, [name, plate]);
    },

    /**
     * Find driver by plate
     * @param {string} plate - Driver plate
     * @returns {Object|null} - Driver or null
     */
    async findByPlate(plate) {
        return queryOne('SELECT * FROM drivers WHERE UPPER(plate) = UPPER(?)', [plate]);
    },

    /**
     * Find driver by CPF
     * @param {string} cpf - Driver CPF
     * @returns {Object|null} - Driver or null
     */
    async findByCpf(cpf) {
        return queryOne('SELECT * FROM drivers WHERE cpf = ?', [cpf]);
    },

    /**
     * Find driver by phone
     * @param {string} phone - Driver phone
     * @returns {Object|null} - Driver or null
     */
    async findByPhone(phone) {
        return queryOne('SELECT * FROM drivers WHERE phone = ?', [phone]);
    },

    /**
     * Get all drivers
     * @param {boolean} activeOnly - Filter active drivers only
     * @returns {Array} - List of drivers
     */
    async findAll(activeOnly = false) {
        if (activeOnly) {
            return query('SELECT * FROM drivers WHERE active = 1 ORDER BY name');
        }
        return query('SELECT * FROM drivers ORDER BY name');
    },

    /**
     * Update driver
     * @param {number} id - Driver ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated driver or null
     */
    async update(id, data) {
        const { name, plate, plates, price_per_km_ton, client, active, phone, cpf, authenticated } = data;
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
        if (plates !== undefined) {
            updates.push('plates = ?');
            values.push(plates && plates.length > 0 ? JSON.stringify(plates) : null);
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
        if (authenticated !== undefined) {
            updates.push('authenticated = ?');
            values.push(authenticated ? 1 : 0);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await execute(`UPDATE drivers SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Deactivate driver (soft delete)
     * @param {number} id - Driver ID
     * @returns {boolean} - Success
     */
    async deactivate(id) {
        const result = await execute('UPDATE drivers SET active = 0 WHERE id = ?', [id]);
        return result.changes > 0;
    },

    /**
     * Verify driver password
     * @param {string} plate - Driver plate
     * @param {string} password - Plain text password
     * @returns {Object|null} - Driver if password matches, null otherwise
     */
    async verifyPassword(plate, password) {
        const driver = await this.findByPlate(plate);
        if (!driver) return null;

        // If driver has no password set, deny login
        if (!driver.password) return null;

        // Verify password
        if (!bcrypt.compareSync(password, driver.password)) return null;

        return driver;
    },

    /**
     * Verify driver password by CPF
     * @param {string} cpf - Driver CPF (digits only)
     * @param {string} password - Plain text password
     * @returns {Object|null} - Driver if password matches, null otherwise
     */
    async verifyPasswordByCpf(cpf, password) {
        const driver = await this.findByCpf(cpf);
        if (!driver) return null;

        // If driver has no password set, deny login
        if (!driver.password) return null;

        // Verify password
        if (!bcrypt.compareSync(password, driver.password)) return null;

        return driver;
    },

    /**
     * Update driver password
     * @param {number} id - Driver ID
     * @param {string} newPassword - New plain text password
     * @returns {Object|null} - Updated driver or null
     */
    async updatePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await execute('UPDATE drivers SET password = ? WHERE id = ?', [hashedPassword, id]);
        return this.findById(id);
    }
};

module.exports = Driver;
