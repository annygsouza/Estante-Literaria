//endpoints de autenticação

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const router = Router();

// Cadastro de usuário

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Cadastrar usuário
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Maria
 *               email:
 *                 type: string
 *                 format: email
 *                 example: maria@exemplo.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: senha1234
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: E-mail já cadastrado
 *       500:
 *         description: Erro interno do servidor
 */

router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== 'string' ||
            !name.trim() ||
            typeof email !== 'string' ||
            !email.trim() ||
            typeof password !== 'string' ||
            password.length < 8
        ) {
            res.status(400).json({
                message:
                    'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.',
            });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [normalizedEmail],
        );

        if (existingUser.rows.length > 0) {
            res.status(409).json({
                message: 'Este e-mail já está cadastrado.',
            });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, created_at`,
            [name.trim(), normalizedEmail, passwordHash],
        );

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso.',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({
            message: 'Erro interno ao cadastrar usuário.',
        });
    }
});

// Login de usuário

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Fazer login
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: maria@exemplo.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: senha1234
 *     responses:
 *       200:
 *         description: Login realizado e token gerado
 *       401:
 *         description: Credenciais incorretas
 */

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !email.trim() ||
            !password
        ) {
            res.status(400).json({
                message: 'Informe e-mail e senha.',
            });
            return;
        }

        const result = await pool.query(
            `SELECT id, name, email, password_hash
             FROM users
             WHERE email = $1`,
            [email.trim().toLowerCase()],
        );

        const user = result.rows[0];

        if (
            !user ||
            !user.password_hash ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            res.status(401).json({
                message: 'E-mail ou senha incorretos.',
            });
            return;
        }

        const secret = process.env.JWT_SECRET;

        if (!secret) {
            res.status(500).json({
                message: 'A chave de autenticação não está configurada.',
            });
            return;
        }

        const token = jwt.sign(
            { userId: user.id },
            secret,
            { expiresIn: '2h' },
        );

        res.json({
            message: 'Login realizado com sucesso.',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            message: 'Erro interno ao realizar login.',
        });
    }
});

export default router;