const express = require('express');
const router = express.Router();
const Driver = require('../models/driver');
const Admin = require('../models/admin');
const Abastecedor = require('../models/abastecedor');
const { isValidPlate, normalizePlate, isValidCPF } = require('../utils/validators');
const { generateToken, verifyToken } = require('../middleware/auth');

/**
 * POST /api/auth/driver/signup
 * Driver sign-up (one-time registration)
 * Creates driver with name, plate, password, phone, and CPF
 */
router.post('/driver/signup', async (req, res) => {
    try {
        const { name, plate, password, phone, cpf } = req.body;

        // Validate input
        if (!name || !plate || !password || !phone || !cpf) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        if (name.trim().length < 2) {
            return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
        }

        // Validate CPF (digits and checksum)
        if (!isValidCPF(cpf)) {
            return res.status(400).json({ error: 'CPF inválido. Verifique os números.' });
        }

        // Validate phone format (at least 10 digits)
        const phoneClean = phone.replace(/\D/g, '');
        const cpfClean = cpf.replace(/\D/g, '');
        if (phoneClean.length < 10) {
            return res.status(400).json({ error: 'Telefone inválido. Deve conter pelo menos 10 dígitos' });
        }

        if (!isValidPlate(plate)) {
            return res.status(400).json({ error: 'Formato de placa inválido. Use ABC-1234 ou ABC-1D23' });
        }

        const normalizedPlate = normalizePlate(plate);

        // Check if plate already exists
        const existingPlate = await Driver.findByPlate(normalizedPlate);
        if (existingPlate) {
            return res.status(409).json({ error: 'Placa já cadastrada no sistema' });
        }

        // Check if CPF already exists
        const existingCpf = await Driver.findByCpf(cpfClean);
        if (existingCpf) {
            return res.status(409).json({ error: 'CPF já cadastrado no sistema' });
        }

        // Check if Phone already exists
        const existingPhone = await Driver.findByPhone(phoneClean);
        if (existingPhone) {
            return res.status(409).json({ error: 'Telefone já cadastrado no sistema' });
        }

        // Create driver with password, phone, and CPF
        const driver = await Driver.create({
            name: name.trim(),
            plate: normalizedPlate,
            price_per_km_ton: 0, // Default, admin will update
            client: null,
            password: password,
            phone: phoneClean,
            cpf: cpfClean
        });

        // Generate JWT token for immediate login
        const token = generateToken({
            id: driver.id,
            name: driver.name,
            plate: driver.plate
        }, 'driver');

        res.status(201).json({
            message: 'Sign-up successful',
            token,
            driver: {
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }
        });
    } catch (error) {
        console.error('Driver signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/driver/login
 * Driver login with CPF and password
 * Returns JWT token
 */
router.post('/driver/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF (remove formatting)
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Deve ter 11 dígitos.' });
        }

        // Verify password using CPF
        const driver = await Driver.verifyPasswordByCpf(cleanCpf, password);

        if (!driver) {
            return res.status(401).json({ error: 'CPF ou senha inválidos' });
        }

        if (!driver.active) {
            return res.status(401).json({ error: 'Conta do motorista está inativa' });
        }

        // Generate JWT token
        const token = generateToken({
            id: driver.id,
            name: driver.name,
            plate: driver.plate
        }, 'driver');

        res.json({
            message: 'Login successful',
            token,
            driver: {
                id: driver.id,
                name: driver.name,
                plate: driver.plate
            }
        });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/admin/login
 * Admin login with username and password
 * Returns JWT token
 */
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const admin = await Admin.verifyCredentials(username, password);

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = generateToken({
            id: admin.id,
            username: admin.username
        }, 'admin');

        res.json({
            message: 'Login successful',
            token,
            admin: {
                id: admin.id,
                username: admin.username
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/abastecedor/login
 * Abastecedor login with CPF and password
 * Returns JWT token
 */
router.post('/abastecedor/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;

        // Validate input
        if (!cpf || !password) {
            return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
        }

        // Clean CPF
        const cpfClean = cpf.replace(/\D/g, '');

        // Validate CPF format
        if (!isValidCPF(cpfClean)) {
            return res.status(400).json({ error: 'CPF inválido' });
        }

        // Verify password
        const abastecedor = await Abastecedor.verifyPassword(cpfClean, password);

        if (!abastecedor) {
            return res.status(401).json({ error: 'CPF ou senha inválidos' });
        }

        if (!abastecedor.active) {
            return res.status(401).json({ error: 'Conta de abastecedor inativa' });
        }

        // Generate JWT token
        const token = generateToken({
            id: abastecedor.id,
            name: abastecedor.name,
            cpf: abastecedor.cpf
        }, 'abastecedor');

        res.json({
            message: 'Login successful',
            token,
            abastecedor: {
                id: abastecedor.id,
                name: abastecedor.name
            }
        });
    } catch (error) {
        console.error('Abastecedor login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/auth/verify
 * Verify token and return user info
 */
router.get('/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }

    let user = { id: decoded.id };
    if (decoded.type === 'admin') {
        user.username = decoded.username;
    } else if (decoded.type === 'driver') {
        user.name = decoded.name;
        user.plate = decoded.plate;
    } else if (decoded.type === 'abastecedor') {
        user.name = decoded.name;
        user.cpf = decoded.cpf;
    }

    res.json({
        valid: true,
        type: decoded.type,
        user
    });
});

module.exports = router;

