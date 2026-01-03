const { execute, query, queryOne } = require('../config/database');
const bcrypt = require('bcryptjs');

const Admin = {
    /**
     * Find admin by username
     * @param {string} username - Admin username
     * @returns {Object|null} - Admin or null
     */
    async findByUsername(username) {
        return queryOne('SELECT * FROM admins WHERE username = ?', [username]);
    },

    /**
     * Verify admin credentials
     * @param {string} username - Admin username
     * @param {string} password - Plain password
     * @returns {Object|null} - Admin (without password) or null
     */
    async verifyCredentials(username, password) {
        const admin = await this.findByUsername(username);
        if (!admin) return null;

        const valid = bcrypt.compareSync(password, admin.password);
        if (!valid) return null;

        // Return admin without password
        const { password: _, ...safeAdmin } = admin;
        return safeAdmin;
    },

    /**
     * Create a new admin
     * @param {string} username - Admin username
     * @param {string} password - Plain password
     * @returns {Object} - Created admin (without password)
     */
    async create(username, password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const result = await execute('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hashedPassword]);

        const admin = await queryOne('SELECT id, username, created_at FROM admins WHERE id = ?', [result.lastInsertRowid]);
        return admin;
    }
};

module.exports = Admin;
