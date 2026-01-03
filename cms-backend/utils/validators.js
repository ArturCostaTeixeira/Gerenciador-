/**
 * Validates Brazilian vehicle plate format
 * Accepts: ABC-1234 (old) or ABC-1D23 (Mercosul)
 * @param {string} plate - The plate to validate
 * @returns {boolean} - True if valid
 */
function isValidPlate(plate) {
    if (!plate || typeof plate !== 'string') return false;
    const plateRegex = /^[A-Z]{3}-\d[A-Z0-9]\d{2}$/i;
    return plateRegex.test(plate.trim());
}

/**
 * Normalizes plate to uppercase with dash
 * @param {string} plate - The plate to normalize
 * @returns {string} - Normalized plate
 */
function normalizePlate(plate) {
    if (!plate) return '';
    return plate.trim().toUpperCase();
}

/**
 * Validates date format (YYYY-MM-DD)
 * @param {string} date - The date to validate
 * @returns {boolean} - True if valid
 */
function isValidDate(date) {
    if (!date) return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
}

/**
 * Validates that a number is positive
 * @param {number} value - The value to validate
 * @returns {boolean} - True if positive number
 */
function isPositiveNumber(value) {
    return typeof value === 'number' && value > 0 && isFinite(value);
}

/**
 * Validates CPF format and checksum
 * @param {string} cpf - The CPF string (can include punctuation)
 * @returns {boolean} - True if valid
 */
function isValidCPF(cpf) {
    if (!cpf) return false;
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++)
        sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);

    remainder = (sum * 10) % 11;

    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++)
        sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);

    remainder = (sum * 10) % 11;

    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;

    return true;
}

module.exports = {
    isValidPlate,
    normalizePlate,
    isValidDate,
    isPositiveNumber,
    isValidCPF
};
