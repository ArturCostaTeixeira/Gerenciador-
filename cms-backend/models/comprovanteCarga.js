const { execute, query, queryOne } = require('../config/database');

const ComprovanteCarga = {
    /**
     * Create a new comprovante carga (add to pool)
     * @param {Object} data - {driver_id, file_path, date}
     * @returns {Object} - Created comprovante
     */
    async create(data) {
        const { driver_id, file_path, date } = data;
        const result = await execute(`
            INSERT INTO comprovantes_carga (driver_id, file_path, date)
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
            SELECT cc.*, d.name as driver_name
            FROM comprovantes_carga cc
            JOIN drivers d ON cc.driver_id = d.id
            WHERE cc.id = ?
        `, [id]);
    },

    /**
     * Find all unassigned comprovantes
     * Returns comprovantes formatted with display name (Driver - Date - N)
     * @returns {Array} - List of unassigned comprovantes with formatted names
     */
    async findUnassigned() {
        const comprovantes = await query(`
            SELECT cc.*, d.name as driver_name
            FROM comprovantes_carga cc
            JOIN drivers d ON cc.driver_id = d.id
            WHERE cc.assigned_freight_id IS NULL
            ORDER BY cc.date DESC, cc.id DESC
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
     * Assign a comprovante to a freight
     * @param {number} comprovanteId - Comprovante ID
     * @param {number} freightId - Freight ID
     * @returns {Object|null} - Updated comprovante
     */
    async assignToFreight(comprovanteId, freightId) {
        const result = await execute(`
            UPDATE comprovantes_carga 
            SET assigned_freight_id = ?
            WHERE id = ? AND assigned_freight_id IS NULL
        `, [freightId, comprovanteId]);

        if (result.changes > 0) {
            // Also update the freight's comprovante_carga field
            const comprovante = await this.findById(comprovanteId);
            if (comprovante) {
                await execute(`
                    UPDATE freights SET comprovante_carga = ? WHERE id = ?
                `, [comprovante.file_path, freightId]);
            }
            return comprovante;
        }
        return null;
    },

    /**
     * Unassign a comprovante from a freight
     * @param {number} freightId - Freight ID
     * @returns {boolean} - Success
     */
    async unassignFromFreight(freightId) {
        const result = await execute(`
            UPDATE comprovantes_carga 
            SET assigned_freight_id = NULL
            WHERE assigned_freight_id = ?
        `, [freightId]);

        // Also clear the freight's comprovante_carga field
        await execute(`
            UPDATE freights SET comprovante_carga = NULL WHERE id = ?
        `, [freightId]);

        return result.changes > 0;
    },

    /**
     * Find comprovante assigned to a freight
     * @param {number} freightId - Freight ID
     * @returns {Object|null} - Comprovante or null
     */
    async findByFreight(freightId) {
        return queryOne(`
            SELECT cc.*, d.name as driver_name
            FROM comprovantes_carga cc
            JOIN drivers d ON cc.driver_id = d.id
            WHERE cc.assigned_freight_id = ?
        `, [freightId]);
    }
};

module.exports = ComprovanteCarga;
