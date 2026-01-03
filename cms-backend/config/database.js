const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// Create database file with WAL mode for better concurrency
const db = new Database(path.join(__dirname, '..', 'cms.db'));

// Enable WAL mode to prevent database locking
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
    -- Drivers table
    CREATE TABLE IF NOT EXISTS drivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        plate TEXT NOT NULL UNIQUE,
        price_per_km_ton REAL NOT NULL,
        client TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Freights table
    CREATE TABLE IF NOT EXISTS freights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        date DATE NOT NULL,
        km REAL NOT NULL,
        tons REAL NOT NULL,
        total_value REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id)
    );

    -- Abastecimentos (Refueling) table
    CREATE TABLE IF NOT EXISTS abastecimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        date DATE NOT NULL,
        quantity REAL NOT NULL,
        price_per_liter REAL NOT NULL,
        total_value REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id)
    );

    -- Admins table
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Clients table
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Outros Insumos table
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
    );

    -- Comprovantes Descarga pool table (unassigned comprovantes)
    CREATE TABLE IF NOT EXISTS comprovantes_descarga (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        date DATE NOT NULL,
        assigned_freight_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id),
        FOREIGN KEY (assigned_freight_id) REFERENCES freights(id)
    );

    -- Comprovantes Abastecimento pool table (unassigned comprovantes)
    CREATE TABLE IF NOT EXISTS comprovantes_abastecimento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        date DATE NOT NULL,
        assigned_abastecimento_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id),
        FOREIGN KEY (assigned_abastecimento_id) REFERENCES abastecimentos(id)
    );

    -- Comprovantes Carga pool table (unassigned comprovantes)
    CREATE TABLE IF NOT EXISTS comprovantes_carga (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        date DATE NOT NULL,
        assigned_freight_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id),
        FOREIGN KEY (assigned_freight_id) REFERENCES freights(id)
    );
`);

// Add 'client' column if it doesn't exist (for existing databases)
try {
    db.exec(`ALTER TABLE drivers ADD COLUMN client TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'client' column to freights table if it doesn't exist
try {
    db.exec(`ALTER TABLE freights ADD COLUMN client TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'comprovante_carga' column to freights table if it doesn't exist
try {
    db.exec(`ALTER TABLE freights ADD COLUMN comprovante_carga TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'comprovante_descarga' column to freights table if it doesn't exist
try {
    db.exec(`ALTER TABLE freights ADD COLUMN comprovante_descarga TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'comprovante_abastecimento' column to abastecimentos table if it doesn't exist
try {
    db.exec(`ALTER TABLE abastecimentos ADD COLUMN comprovante_abastecimento TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'price_per_km_ton' column to freights table if it doesn't exist
try {
    db.exec(`ALTER TABLE freights ADD COLUMN price_per_km_ton REAL`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'status' column to freights table (pending = needs admin completion, complete = all data filled)
try {
    db.exec(`ALTER TABLE freights ADD COLUMN status TEXT DEFAULT 'complete'`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'paid' column to freights table (0 = unpaid, 1 = paid) - payment TO driver
try {
    db.exec(`ALTER TABLE freights ADD COLUMN paid INTEGER DEFAULT 0`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'client_paid' column to freights table (0 = unpaid, 1 = paid) - payment FROM client
try {
    db.exec(`ALTER TABLE freights ADD COLUMN client_paid INTEGER DEFAULT 0`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'status' column to abastecimentos table (pending = needs admin completion, complete = all data filled)
try {
    db.exec(`ALTER TABLE abastecimentos ADD COLUMN status TEXT DEFAULT 'complete'`);
} catch (e) {
    // Column already exists, ignore
}

// Create payments table
db.exec(`
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

// Add 'password' column to drivers table if it doesn't exist
try {
    db.exec(`ALTER TABLE drivers ADD COLUMN password TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'phone' column to drivers table if it doesn't exist
try {
    db.exec(`ALTER TABLE drivers ADD COLUMN phone TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Add 'cpf' column to drivers table if it doesn't exist
try {
    db.exec(`ALTER TABLE drivers ADD COLUMN cpf TEXT`);
} catch (e) {
    // Column already exists, ignore
}

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hashedPassword);
    console.log('Default admin created: admin / admin123');
}

module.exports = db;
