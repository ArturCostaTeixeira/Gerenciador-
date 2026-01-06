require('dotenv').config();
const { execute, query } = require('./config/database');
const fs = require('fs');

async function cleanTables() {
    let log = '';
    const logIt = (msg) => {
        console.log(msg);
        log += msg + '\n';
    };

    logIt('Connecting to database...');
    logIt('Database URL: ' + (process.env.TURSO_DATABASE_URL ? 'Set' : 'NOT SET'));

    const tablesToClean = [
        'payments',
        'comprovantes_descarga',
        'comprovantes_abastecimento',
        'comprovantes_carga',
        'outros_insumos',
        'freights',
        'abastecimentos',
        'drivers',
        'clients',
        'abastecedores'
    ];

    logIt('\nCleaning tables...\n');

    for (const table of tablesToClean) {
        try {
            const before = await query(`SELECT COUNT(*) as count FROM ${table}`);
            logIt(`${table}: ${before[0].count} records -> deleting...`);

            await execute(`DELETE FROM ${table}`);

            const after = await query(`SELECT COUNT(*) as count FROM ${table}`);
            logIt(`${table}: now ${after[0].count} records`);
        } catch (error) {
            logIt(`Error with ${table}: ${error.message}`);
        }
    }

    logIt('\n=== Cleanup complete! ===');

    const admins = await query('SELECT id, username FROM admins');
    logIt('Admins preserved: ' + JSON.stringify(admins));

    fs.writeFileSync('cleanup-log.txt', log);
}

cleanTables()
    .then(() => process.exit(0))
    .catch(err => {
        fs.writeFileSync('cleanup-log.txt', 'Error: ' + err.message);
        process.exit(1);
    });
