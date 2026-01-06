/**
 * Migration: Remove UNIQUE constraint from plate column in drivers table
 * 
 * This is needed because multiple drivers can share the same truck (plate).
 * 
 * Run with: node migrations/remove-plate-unique.js
 */

require('dotenv').config();
const { client, query, execute, exec } = require('../config/database');

async function migrate() {
    console.log('Starting migration: Remove UNIQUE constraint from plate column...');

    try {
        // Disable foreign key checks
        console.log('Disabling foreign key checks...');
        await client.execute('PRAGMA foreign_keys = OFF');

        // Step 1: Create new table without UNIQUE constraint on plate
        console.log('Creating new drivers table without UNIQUE constraint on plate...');
        await exec(`
            CREATE TABLE IF NOT EXISTS drivers_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                plate TEXT NOT NULL,
                plates TEXT,
                price_per_km_ton REAL NOT NULL,
                client TEXT,
                active INTEGER DEFAULT 1,
                password TEXT,
                phone TEXT,
                cpf TEXT,
                authenticated INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Step 2: Copy data from old table to new table
        console.log('Copying data to new table...');
        await exec(`
            INSERT INTO drivers_new (id, name, plate, plates, price_per_km_ton, client, active, password, phone, cpf, authenticated, created_at)
            SELECT id, name, plate, plates, price_per_km_ton, client, active, password, phone, cpf, authenticated, created_at
            FROM drivers
        `);

        // Step 3: Drop old table
        console.log('Dropping old drivers table...');
        await exec(`DROP TABLE drivers`);

        // Step 4: Rename new table to original name
        console.log('Renaming new table to drivers...');
        await exec(`ALTER TABLE drivers_new RENAME TO drivers`);

        // Re-enable foreign key checks
        console.log('Re-enabling foreign key checks...');
        await client.execute('PRAGMA foreign_keys = ON');

        console.log('Migration completed successfully!');
        console.log('The UNIQUE constraint on the plate column has been removed.');
        console.log('Multiple drivers can now share the same truck plate.');

    } catch (error) {
        console.error('Migration failed:', error);

        // Cleanup: try to drop drivers_new if it exists
        try {
            await exec(`DROP TABLE IF EXISTS drivers_new`);
        } catch (e) {
            // Ignore cleanup errors
        }

        // Re-enable foreign key checks anyway
        try {
            await client.execute('PRAGMA foreign_keys = ON');
        } catch (e) {
            // Ignore
        }

        process.exit(1);
    }

    process.exit(0);
}

migrate();
