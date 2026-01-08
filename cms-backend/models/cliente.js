const { execute, query, queryOne } = require('../config/database');
const bcrypt = require('bcryptjs');

const Cliente = {
    /**
     * Create a new cliente
     * @param {Object} data - {empresa, name, cpf, cnpj, password, phone}
     * @returns {Object} - Created cliente
     */
    async create(data) {
        const { empresa, name, cpf, cnpj, password, phone } = data;

        // Hash password if provided
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

        const result = await execute(`
            INSERT INTO clientes (empresa, name, cpf, cnpj, password, phone)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [empresa, name, cpf || null, cnpj || null, hashedPassword, phone || null]);

        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find cliente by ID
     * @param {number} id - Cliente ID
     * @returns {Object|null} - Cliente or null
     */
    async findById(id) {
        return queryOne('SELECT * FROM clientes WHERE id = ?', [id]);
    },

    /**
     * Find cliente by CPF
     * @param {string} cpf - Cliente CPF
     * @returns {Object|null} - Cliente or null
     */
    async findByCpf(cpf) {
        return queryOne('SELECT * FROM clientes WHERE cpf = ?', [cpf]);
    },

    /**
     * Find cliente by empresa (company name) - for linking freights
     * @param {string} empresa - Empresa name
     * @returns {Object|null} - Cliente or null
     */
    async findByEmpresa(empresa) {
        return queryOne('SELECT * FROM clientes WHERE empresa = ?', [empresa]);
    },

    /**
     * Get all clientes
     * @param {boolean} activeOnly - Filter active clientes only
     * @returns {Array} - List of clientes
     */
    async findAll(activeOnly = false) {
        if (activeOnly) {
            return query('SELECT * FROM clientes WHERE active = 1 ORDER BY empresa, name');
        }
        return query('SELECT * FROM clientes ORDER BY empresa, name');
    },

    /**
     * Update cliente
     * @param {number} id - Cliente ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated cliente or null
     */
    async update(id, data) {
        const { empresa, name, cpf, cnpj, phone, active } = data;
        const updates = [];
        const values = [];

        if (empresa !== undefined) {
            updates.push('empresa = ?');
            values.push(empresa);
        }
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (cpf !== undefined) {
            updates.push('cpf = ?');
            values.push(cpf);
        }
        if (cnpj !== undefined) {
            updates.push('cnpj = ?');
            values.push(cnpj);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            values.push(phone);
        }
        if (active !== undefined) {
            updates.push('active = ?');
            values.push(active ? 1 : 0);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await execute(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Verify cliente password
     * @param {string} cpf - Cliente CPF
     * @param {string} password - Plain text password
     * @returns {Object|null} - Cliente if password matches, null otherwise
     */
    async verifyPassword(cpf, password) {
        const cliente = await this.findByCpf(cpf);
        if (!cliente) return null;

        // If cliente has no password set, deny login
        if (!cliente.password) return null;

        // Verify password
        if (!bcrypt.compareSync(password, cliente.password)) return null;

        return cliente;
    },

    /**
     * Update cliente password
     * @param {number} id - Cliente ID
     * @param {string} newPassword - New plain text password
     * @returns {Object|null} - Updated cliente
     */
    async updatePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await execute('UPDATE clientes SET password = ? WHERE id = ?', [hashedPassword, id]);
        return this.findById(id);
    },

    /**
     * Get freights for a cliente by empresa (company name)
     * @param {string} empresa - The empresa (company) name to filter freights
     * @param {Object} filters - {date_from, date_to}
     * @returns {Array} - List of freights
     */
    async getFreights(empresa, filters = {}) {
        let sql = `
            SELECT f.*, d.name as driver_name, d.plate as driver_plate
            FROM freights f
            JOIN drivers d ON f.driver_id = d.id
            WHERE f.client = ? AND f.status = 'complete'
        `;
        const values = [empresa];

        if (filters.date_from) {
            sql += ' AND f.date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND f.date <= ?';
            values.push(filters.date_to);
        }

        sql += ' ORDER BY f.date DESC, f.id DESC';
        return query(sql, values);
    },

    /**
     * Get freight statistics for a cliente
     * @param {string} empresa - The empresa (company) name
     * @param {Object} filters - {date_from, date_to}
     * @returns {Object} - Stats
     */
    async getStats(empresa, filters = {}) {
        let sql = `
            SELECT 
                COUNT(*) as total_freights,
                COALESCE(SUM(km), 0) as total_km,
                COALESCE(SUM(tons), 0) as total_tons,
                COALESCE(SUM(total_value_transportadora), 0) as total_value
            FROM freights
            WHERE client = ? AND status = 'complete'
        `;
        const values = [empresa];

        if (filters.date_from) {
            sql += ' AND date >= ?';
            values.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND date <= ?';
            values.push(filters.date_to);
        }

        return queryOne(sql, values);
    }
};

module.exports = Cliente;
