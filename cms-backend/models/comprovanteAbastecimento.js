const { execute, query, queryOne } = require('../config/database');

const ComprovanteAbastecimento = {
    /**
     * Create a new comprovante abastecimento (add to pool)
     * @param {Object} data - {driver_id, file_path, date}
     * @returns {Object} - Created comprovante
     */
    async create(data) {
        const { driver_id, file_path, date } = data;
        const result = await execute(`
            INSERT INTO comprovantes_abastecimento (driver_id, file_path, date)
            VALUES (?, ?, ?)
        `, [driver_id, file_path, date]);
        return this.findById(result.lastInsertRowid);
    },

    /**
     * Find comprovante by ID
     * @param {number} id - Comprovante ID
     * @returns {Object|null} - Comprovante or null
     */
    async findById(id) {
        return queryOne(`
            SELECT ca.*, d.name as driver_name
            FROM comprovantes_abastecimento ca
            JOIN drivers d ON ca.driver_id = d.id
            WHERE ca.id = ?
        `, [id]);
    },

    /**
     * Find all unassigned comprovantes
     * Returns comprovantes formatted with display name (Driver - Date - N)
     * @returns {Array} - List of unassigned comprovantes with formatted names
     */
    async findUnassigned() {
        const comprovantes = await query(`
            SELECT ca.*, d.name as driver_name
            FROM comprovantes_abastecimento ca
            JOIN drivers d ON ca.driver_id = d.id
            WHERE ca.assigned_abastecimento_id IS NULL
            ORDER BY ca.date DESC, ca.id DESC
        `);

        // Group by driver and date to handle numbering
        const grouped = {};
        comprovantes.forEach(c => {
            const key = `${c.driver_id}-${c.date}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(c);
        });

        // Add display names with numbering if multiple on same day
        return comprovantes.map(c => {
            const key = `${c.driver_id}-${c.date}`;
            const group = grouped[key];
            const dateFormatted = new Date(c.date + 'T00:00:00').toLocaleDateString('pt-BR');

            if (group.length === 1) {
                c.display_name = `${c.driver_name} - ${dateFormatted}`;
            } else {
                // Find index in group (sorted by id ascending for numbering)
                const sortedGroup = [...group].sort((a, b) => a.id - b.id);
                const index = sortedGroup.findIndex(item => item.id === c.id) + 1;
                c.display_name = `${c.driver_name} - ${dateFormatted} - ${index}`;
            }

            return c;
        });
    },

    /**
     * Assign a comprovante to an abastecimento
     * @param {number} comprovanteId - Comprovante ID
     * @param {number} abastecimentoId - Abastecimento ID
     * @returns {Object|null} - Updated comprovante
     */
    async assignToAbastecimento(comprovanteId, abastecimentoId) {
        const result = await execute(`
            UPDATE comprovantes_abastecimento 
            SET assigned_abastecimento_id = ?
            WHERE id = ? AND assigned_abastecimento_id IS NULL
        `, [abastecimentoId, comprovanteId]);

        if (result.changes > 0) {
            // Also update the abastecimento's comprovante_abastecimento field
            const comprovante = await this.findById(comprovanteId);
            if (comprovante) {
                await execute(`
                    UPDATE abastecimentos SET comprovante_abastecimento = ? WHERE id = ?
                `, [comprovante.file_path, abastecimentoId]);
            }
            return comprovante;
        }
        return null;
    },

    /**
     * Unassign a comprovante from an abastecimento
     * @param {number} abastecimentoId - Abastecimento ID
     * @returns {boolean} - Success
     */
    async unassignFromAbastecimento(abastecimentoId) {
        const result = await execute(`
            UPDATE comprovantes_abastecimento 
            SET assigned_abastecimento_id = NULL
            WHERE assigned_abastecimento_id = ?
        `, [abastecimentoId]);

        // Also clear the abastecimento's comprovante_abastecimento field
        await execute(`
            UPDATE abastecimentos SET comprovante_abastecimento = NULL WHERE id = ?
        `, [abastecimentoId]);

        return result.changes > 0;
    },

    /**
     * Find comprovante assigned to an abastecimento
     * @param {number} abastecimentoId - Abastecimento ID
     * @returns {Object|null} - Comprovante or null
     */
    async findByAbastecimento(abastecimentoId) {
        return queryOne(`
            SELECT ca.*, d.name as driver_name
            FROM comprovantes_abastecimento ca
            JOIN drivers d ON ca.driver_id = d.id
            WHERE ca.assigned_abastecimento_id = ?
        `, [abastecimentoId]);
    }
};

module.exports = ComprovanteAbastecimento;
