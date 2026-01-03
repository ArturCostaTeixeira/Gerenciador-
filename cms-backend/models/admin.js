const db = require('../config/database');
const bcrypt = require('bcryptjs');

const Admin = {
    /**
     * Find admin by username
     * @param {string} username - Admin username
     * @returns {Object|null} - Admin or null
     */
    findByUsername(username) {
        return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    },

    /**
     * Verify admin credentials
     * @param {string} username - Admin username
     * @param {string} password - Plain password
     * @returns {Object|null} - Admin (without password) or null
     */
    verifyCredentials(username, password) {
        const admin = this.findByUsername(username);
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
    create(username, password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const stmt = db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)');
        const result = stmt.run(username, hashedPassword);

        const admin = db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?').get(result.lastInsertRowid);
        return admin;
    }
};

module.exports = Admin;
