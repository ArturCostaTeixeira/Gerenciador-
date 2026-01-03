require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// Create Turso client
const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

/**
 * Execute a write query (INSERT, UPDATE, DELETE)
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Parameters to bind
 * @returns {Object} - { rowsAffected, lastInsertRowid }
 */
async function execute(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return {
        changes: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid
    };
}

/**
 * Query multiple rows
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Parameters to bind
 * @returns {Array} - Array of row objects
 */
async function query(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows;
}

/**
 * Query a single row
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Parameters to bind
 * @returns {Object|null} - Row object or null
 */
async function queryOne(sql, params = []) {
    const result = await client.execute({ sql, args: params });
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Execute raw SQL (for DDL statements)
 * @param {string} sql - Raw SQL
 */
async function exec(sql) {
    // Split by semicolons and execute each statement
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
        if (stmt.trim()) {
            await client.execute(stmt.trim());
        }
    }
}

/**
 * Initialize database tables
 */
async function initDatabase() {
    // Create tables
    await exec(`
        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            plate TEXT NOT NULL UNIQUE,
            price_per_km_ton REAL NOT NULL,
            client TEXT,
            active INTEGER DEFAULT 1,
            password TEXT,
            phone TEXT,
            cpf TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS freights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            date DATE NOT NULL,
            km REAL NOT NULL,
            tons REAL NOT NULL,
            total_value REAL NOT NULL,
            client TEXT,
            comprovante_carga TEXT,
            comprovante_descarga TEXT,
            price_per_km_ton REAL,
            status TEXT DEFAULT 'complete',
            paid INTEGER DEFAULT 0,
            client_paid INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS abastecimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            date DATE NOT NULL,
            quantity REAL NOT NULL,
            price_per_liter REAL NOT NULL,
            total_value REAL NOT NULL,
            comprovante_abastecimento TEXT,
            status TEXT DEFAULT 'complete',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS outros_insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            date DATE NOT NULL,
            quantity REAL NOT NULL,
            description TEXT,
            unit_price REAL NOT NULL,
            total_value REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS comprovantes_descarga (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            date DATE NOT NULL,
            assigned_freight_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id),
            FOREIGN KEY (assigned_freight_id) REFERENCES freights(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS comprovantes_abastecimento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            date DATE NOT NULL,
            assigned_abastecimento_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id),
            FOREIGN KEY (assigned_abastecimento_id) REFERENCES abastecimentos(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS comprovantes_carga (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            date DATE NOT NULL,
            assigned_freight_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id),
            FOREIGN KEY (assigned_freight_id) REFERENCES freights(id)
        )
    `);

    await exec(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            date_range TEXT NOT NULL,
            total_value REAL NOT NULL,
            comprovante_path TEXT,
            freight_ids TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
        )
    `);

    // Create default admin if not exists
    const adminExists = await queryOne('SELECT id FROM admins WHERE username = ?', ['admin']);
    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await execute('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
        console.log('Default admin created: admin / admin123');
    }

    console.log('Database initialized successfully');
}

module.exports = {
    client,
    execute,
    query,
    queryOne,
    exec,
    initDatabase
};
