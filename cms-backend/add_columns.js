const db = require('better-sqlite3')('cms.db');

try {
    console.log('Adding password column...');
    db.exec(`ALTER TABLE drivers ADD COLUMN password TEXT`);
} catch (e) {
    console.log('password column likely exists:', e.message);
}

try {
    console.log('Adding phone column...');
    db.exec(`ALTER TABLE drivers ADD COLUMN phone TEXT`);
} catch (e) {
    console.log('phone column likely exists:', e.message);
}

try {
    console.log('Adding cpf column...');
    db.exec(`ALTER TABLE drivers ADD COLUMN cpf TEXT`);
} catch (e) {
    console.log('cpf column likely exists:', e.message);
}

console.log('Current columns:');
const columns = db.pragma('table_info(drivers)');
console.log(columns.map(c => c.name));
