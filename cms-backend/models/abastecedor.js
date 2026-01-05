const { execute, query, queryOne } = require('../config/database');
const bcrypt = require('bcryptjs');

const Abastecedor = {
    /**
     * Create a new abastecedor
     * @param {Object} data - {name, cpf, password, phone}
     * @returns {Object} - Created abastecedor
     */
    async create(data) {
        const { name, cpf, password, phone } = data;

        // Hash password if provided
        const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;

        const result = await execute(`
            INSERT INTO abastecedores (name, cpf, password, phone)
            VALUES (?, ?, ?, ?)
        `, [name, cpf, hashedPassword, phone || null]);

        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find abastecedor by ID
     * @param {number} id - Abastecedor ID
     * @returns {Object|null} - Abastecedor or null
     */
    async findById(id) {
        return queryOne('SELECT * FROM abastecedores WHERE id = ?', [id]);
    },

    /**
     * Find abastecedor by CPF
     * @param {string} cpf - Abastecedor CPF
     * @returns {Object|null} - Abastecedor or null
     */
    async findByCpf(cpf) {
        return queryOne('SELECT * FROM abastecedores WHERE cpf = ?', [cpf]);
    },

    /**
     * Get all abastecedores
     * @param {boolean} activeOnly - Filter active abastecedores only
     * @returns {Array} - List of abastecedores
     */
    async findAll(activeOnly = false) {
        if (activeOnly) {
            return query('SELECT * FROM abastecedores WHERE active = 1 ORDER BY name');
        }
        return query('SELECT * FROM abastecedores ORDER BY name');
    },

    /**
     * Update abastecedor
     * @param {number} id - Abastecedor ID
     * @param {Object} data - Fields to update
     * @returns {Object|null} - Updated abastecedor or null
     */
    async update(id, data) {
        const { name, phone, active } = data;
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
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
        await execute(`UPDATE abastecedores SET ${updates.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    /**
     * Verify abastecedor password
     * @param {string} cpf - Abastecedor CPF
     * @param {string} password - Plain text password
     * @returns {Object|null} - Abastecedor if password matches, null otherwise
     */
    async verifyPassword(cpf, password) {
        const abastecedor = await this.findByCpf(cpf);
        if (!abastecedor) return null;

        // If abastecedor has no password set, deny login
        if (!abastecedor.password) return null;

        // Verify password
        if (!bcrypt.compareSync(password, abastecedor.password)) return null;

        return abastecedor;
    }
};

module.exports = Abastecedor;
