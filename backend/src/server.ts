//inicialização do servidor
import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { pool } from './config/database';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import authRoutes from './routes/auth.routes';
import { authenticateToken } from './middleware/auth.middleware';
import { AuthRequest } from './middleware/auth.middleware';
const app = express();

const coversDirectory = path.resolve(__dirname, '../uploads/covers');
const maxCoverSize = 5 * 1024 * 1024;
const allowedCoverMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadCover = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxCoverSize },
    fileFilter: (_req, file, callback) => {
        if (!allowedCoverMimeTypes.has(file.mimetype)) {
            return callback(new Error('Formato inválido. Use JPEG, PNG ou WebP.'));
        }

        callback(null, true);
    },
});

type CoverFormat = {
    mime: 'image/jpeg' | 'image/png' | 'image/webp';
    extension: 'jpg' | 'png' | 'webp';
};

function detectCoverFormat(buffer: Buffer): CoverFormat | null {
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return { mime: 'image/jpeg', extension: 'jpg' };
    }

    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
        return { mime: 'image/png', extension: 'png' };
    }

    if (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return { mime: 'image/webp', extension: 'webp' };
    }

    return null;
}

function getStoredCoverPath(coverPath: string): string {
    const relativePath = coverPath.replace(/\\/g, '/').replace(/^\/+/u, '');
    const normalized = relativePath.replace(/^covers\//u, '');

    if (!normalized || normalized.includes('..') || normalized.startsWith('/')) {
        throw new Error('Referência de capa inválida.');
    }

    const resolvedPath = path.resolve(coversDirectory, normalized);

    if (!resolvedPath.startsWith(`${coversDirectory}${path.sep}`)) {
        throw new Error('Referência de capa inválida.');
    }

    return resolvedPath;
}

async function removeStoredCover(coverPath: string | null): Promise<void> {
    if (!coverPath) {
        return;
    }

    try {
        await fs.unlink(getStoredCoverPath(coverPath));
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
    }
}

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);

app.get('/', (_req, res) => {
    res.json({
        message: 'API Estante Literária funcionando!',
    });
});

app.get('/api/health', authenticateToken, async (_req, res) => {
    try {
        const result = await pool.query('SELECT NOW() AS horario');

        res.json({
            status: 'ok',
            database: 'conectado',
            horario: result.rows[0].horario,
        });
    } catch (error) {
        console.error('Erro ao consultar o banco:', error);

        res.status(500).json({
            status: 'erro',
            database: 'desconectado',
        });
    }
});

/**
 * @openapi
 * /api/books/{id}/cover:
 *   post:
 *     summary: Envia ou substitui a capa de um livro
 *     tags:
 *       - Capas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - cover
 *             properties:
 *               cover:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo de imagem em JPEG, PNG ou WebP até 5 MB.
 *     responses:
 *       201:
 *         description: Capa armazenada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 cover_path:
 *                   type: string
 *                 cover_mime:
 *                   type: string
 *       400:
 *         description: Arquivo ausente, formato inválido ou corpo não multipart
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Livro não encontrado
 *       413:
 *         description: Arquivo maior que 5 MB
 *       500:
 *         description: Falha ao gravar a imagem ou atualizar o banco
 */
app.post(
    '/api/books/:id/cover',
    authenticateToken,
    (req, res, next) => {
        uploadCover.single('cover')(req, res, (error) => {
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'A capa não pode exceder 5 MB.' });
                }

                if (error.code === 'LIMIT_UNEXPECTED_FILE') {
                    return res.status(400).json({ error: 'Envie um arquivo no campo cover.' });
                }

                return res.status(400).json({ error: `Erro no upload da capa: ${error.message}` });
            }

            if (error) {
                return res.status(400).json({ error: error.message || 'Erro no upload da capa.' });
            }

            next();
        });
    },
    async (req: AuthRequest, res) => {
        const id = Number(req.params.id);
        const userId = req.userId;
        const uploadedFile = req.file;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'O ID deve ser um número inteiro positivo.' });
        }

        if (!uploadedFile) {
            return res.status(400).json({ error: 'Envie um arquivo no campo cover.' });
        }

        const format = detectCoverFormat(uploadedFile.buffer);

        if (!format) {
            return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
        }

        if (uploadedFile.mimetype !== format.mime) {
            return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
        }

        let temporaryPath: string | undefined;

        try {
            const bookResult = await pool.query(
                'SELECT cover_path FROM books WHERE id = $1 AND user_id = $2',
                [id, userId],
            );

            if (bookResult.rows.length === 0) {
                return res.status(404).json({ error: 'Livro não encontrado.' });
            }

            await fs.mkdir(coversDirectory, { recursive: true });

            const fileName = `${crypto.randomUUID()}.${format.extension}`;
            const storedPath = `covers/${fileName}`;
            const finalPath = path.resolve(coversDirectory, fileName);
            temporaryPath = `${finalPath}.tmp`;

            await fs.writeFile(temporaryPath, uploadedFile.buffer, { flag: 'wx' });
            await fs.rename(temporaryPath, finalPath);

            try {
                await pool.query(
                    `UPDATE books
                     SET cover_path = $1, cover_mime = $2
                     WHERE id = $3 AND user_id = $4`,
                    [storedPath, format.mime, id, userId],
                );
            } catch (error) {
                await fs.unlink(finalPath).catch(() => undefined);
                throw error;
            }

            await removeStoredCover(bookResult.rows[0].cover_path);

            return res.status(201).json({
                message: 'Capa armazenada com sucesso.',
                cover_path: storedPath,
                cover_mime: format.mime,
            });
        } catch (error) {
            if (temporaryPath) {
                await fs.unlink(temporaryPath).catch(() => undefined);
            }

            console.error('Erro ao armazenar capa:', error);
            return res.status(500).json({ error: 'Não foi possível armazenar a capa.' });
        }
    },
);

/**
 * @openapi
 * /api/books/{id}/cover:
 *   get:
 *     summary: Consulta a capa de um livro
 *     tags:
 *       - Capas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Arquivo da capa retornado com o MIME correto
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Livro, capa ou arquivo físico não encontrado
 *       500:
 *         description: Falha de consulta ou leitura do arquivo
 */
app.get('/api/books/:id/cover', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'O ID deve ser um número inteiro positivo.' });
    }

    try {
        const result = await pool.query(
            `SELECT cover_path, cover_mime
             FROM books
             WHERE id = $1 AND user_id = $2`,
            [id, userId],
        );

        if (result.rows.length === 0 || !result.rows[0].cover_path) {
            return res.status(404).json({ error: 'Livro ou capa não encontrada.' });
        }

        const filePath = getStoredCoverPath(result.rows[0].cover_path);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Arquivo da capa não encontrado.' });
        }

        res.type(result.rows[0].cover_mime || 'application/octet-stream');
        return res.sendFile(filePath);
    } catch (error) {
        console.error('Erro ao consultar capa:', error);
        return res.status(500).json({ error: 'Não foi possível consultar a capa.' });
    }
});

/**
 * @openapi
 * /api/categories:
 *   get:
 *     summary: Lista as categorias do usuário autenticado
 *     tags:
 *       - Categorias
 *     responses:
 *       200:
 *         description: Categorias retornadas com sucesso
 */
app.get('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.userId;

    try {
        const result = await pool.query(
            `SELECT id, user_id, name, description, created_at
             FROM categories
             WHERE user_id = $1
             ORDER BY name, id`,
            [userId],
        );

        return res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        return res.status(500).json({
            error: 'Não foi possível consultar as categorias.',
        });
    }
});

/**
 * @openapi
 * /api/categories:
 *   post:
 *     summary: Cadastra uma categoria
 *     tags:
 *       - Categorias
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Fantasia
 *               description:
 *                 type: string
 *                 example: Livros de fantasia e aventura.
 *     responses:
 *       201:
 *         description: Categoria cadastrada com sucesso
 *       400:
 *         description: Dados inválidos
 */
app.post('/api/categories', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.userId;
    const { name, description } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'O nome da categoria é obrigatório.',
        });
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
        return res.status(400).json({
            error: 'A descrição deve ser um texto.',
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO categories (user_id, name, description)
             VALUES ($1, $2, $3)
             RETURNING id, user_id, name, description, created_at`,
            [userId, name.trim(), description?.trim() || null],
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao cadastrar categoria:', error);
        return res.status(500).json({
            error: 'Não foi possível cadastrar a categoria.',
        });
    }
});

/**
 * @openapi
 * /api/categories/{id}:
 *   get:
 *     summary: Busca uma categoria do usuário autenticado
 *     tags:
 *       - Categorias
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Categoria encontrada
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Categoria não encontrada
 */
app.get('/api/categories/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, user_id, name, description, created_at
             FROM categories
             WHERE id = $1 AND user_id = $2`,
            [id, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada.' });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar categoria:', error);
        return res.status(500).json({
            error: 'Não foi possível consultar a categoria.',
        });
    }
});

/**
 * @openapi
 * /api/categories/{id}:
 *   put:
 *     summary: Atualiza uma categoria
 *     tags:
 *       - Categorias
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Ficção científica
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Categoria atualizada
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Categoria não encontrada
 */
app.put('/api/categories/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;
    const { name, description } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            error: 'O nome da categoria é obrigatório.',
        });
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
        return res.status(400).json({
            error: 'A descrição deve ser um texto.',
        });
    }

    try {
        const result = await pool.query(
            `UPDATE categories
             SET name = $1, description = $2
             WHERE id = $3 AND user_id = $4
             RETURNING id, user_id, name, description, created_at`,
            [name.trim(), description?.trim() || null, id, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada.' });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        return res.status(500).json({
            error: 'Não foi possível atualizar a categoria.',
        });
    }
});

/**
 * @openapi
 * /api/categories/{id}:
 *   delete:
 *     summary: Exclui uma categoria
 *     tags:
 *       - Categorias
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Categoria excluída
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Categoria não encontrada
 *       409:
 *         description: Categoria vinculada a livros
 */
app.delete('/api/categories/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    try {
        const result = await pool.query(
            `DELETE FROM categories
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada.' });
        }

        return res.status(204).send();
    } catch (error: any) {
        if (error?.code === '23503') {
            return res.status(409).json({
                error: 'Não é possível excluir uma categoria vinculada a livros.',
            });
        }

        console.error('Erro ao excluir categoria:', error);
        return res.status(500).json({
            error: 'Não foi possível excluir a categoria.',
        });
    }
});


/**
 * @openapi
 * /api/books:
 *   get:
 *     summary: Lista todos os livros
 *     tags:
 *       - Livros
 *     responses:
 *       200:
 *         description: Lista de livros retornada com sucesso
 */

app.get('/api/books', authenticateToken, async (req, res) => {
    const userId = (req as import('./middleware/auth.middleware').AuthRequest).userId;

    try {
        const result = await pool.query(
            `SELECT
                id,
                user_id,
                title,
                author,
                publisher,
                total_pages,
                pages_read,
                spine_color,
                spine_size,
                created_at
             FROM books
             WHERE user_id = $1
             ORDER BY id`,
            [userId],
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar livros:', error);
        res.status(500).json({
            error: 'Não foi possível consultar os livros.',
        });
    }
});

/**
 * @openapi
 * /api/books:
 *   post:
 *     summary: Cadastra um livro
 *     tags:
 *       - Livros
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - title
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 1
 *               title:
 *                 type: string
 *                 example: O Nome do Vento
 *               author:
 *                 type: string
 *                 example: Patrick Rothfuss
 *               publisher:
 *                 type: string
 *                 example: Arqueiro
 *               total_pages:
 *                 type: integer
 *                 example: 656
 *               pages_read:
 *                 type: integer
 *                 example: 0
 *               spine_color:
 *                 type: string
 *                 example: "#7741dd"
 *               spine_size:
 *                 type: string
 *                 enum:
 *                   - pequeno
 *                   - medio
 *                   - grande
 *                 example: medio
 *     responses:
 *       201:
 *         description: Livro cadastrado com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes
 *       500:
 *         description: Erro interno do servidor
 */

//post cadastra os livros enviando dados pela api
app.post('/api/books', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.userId;

    const {
        title,
        author,
        publisher,
        total_pages,
        pages_read,
        spine_color,
        spine_size,
    } = req.body;

    if (!userId) {
        return res.status(401).json({
            error: 'Usuário não autenticado.',
        });
    }

    if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
            error: 'O título é obrigatório.',
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO books (
                user_id,
                title,
                author,
                publisher,
                total_pages,
                pages_read,
                spine_color,
                spine_size
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                userId,
                title.trim(),
                author ?? null,
                publisher ?? null,
                total_pages ?? null,
                pages_read ?? 0,
                spine_color ?? '#7741dd',
                spine_size ?? 'medio',
            ],
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao cadastrar livro:', error);

        return res.status(500).json({
            error: 'Não foi possível cadastrar o livro.',
        });
    }
});

/**
 * @openapi
 * /api/books/{id}:
 *   get:
 *     summary: Busca um livro pelo ID
 *     tags:
 *       - Livros
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do livro
 *     responses:
 *       200:
 *         description: Livro encontrado
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Livro não encontrado
 */

app.get('/api/books/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM books WHERE id = $1 AND user_id = $2',
            [id,userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Livro não encontrado.',
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar livro:', error);

        return res.status(500).json({
            error: 'Não foi possível consultar o livro.',
        });
    }
});


/**
 * @openapi
 * /api/books/{id}:
 *   put:
 *     summary: Atualiza um livro
 *     tags:
 *       - Livros
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - pages_read
 *             properties:
 *               title:
 *                 type: string
 *                 example: O Nome do Vento
 *               author:
 *                 type: string
 *                 example: Patrick Rothfuss
 *               publisher:
 *                 type: string
 *                 example: Arqueiro
 *               total_pages:
 *                 type: integer
 *                 example: 656
 *               pages_read:
 *                 type: integer
 *                 example: 100
 *               spine_color:
 *                 type: string
 *                 example: "#7741dd"
 *               spine_size:
 *                 type: string
 *                 enum:
 *                   - pequeno
 *                   - medio
 *                   - grande
 *     responses:
 *       200:
 *         description: Livro atualizado
 *       400:
 *         description: Dados inválidos ou obrigatórios ausentes
 *       404:
 *         description: Livro não encontrado
 */

app.put('/api/books/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    const {
        title,
        author,
        publisher,
        total_pages,
        pages_read,
        spine_color,
        spine_size,
    } = req.body;

    if (
        title === undefined ||
        title.trim() === '' ||
        pages_read === undefined
    ) {
        return res.status(400).json({
            error: 'Informe o título e o número de páginas lidas.',
        });
    }

    try {
        const result = await pool.query(
            `UPDATE books
             SET title = $1,
                 author = $2,
                 publisher = $3,
                 total_pages = $4,
                 pages_read = $5,
                 spine_color = $6,
                 spine_size = $7
             WHERE id = $8 AND user_id = $9
             RETURNING *`,
            [
                title,
                author ?? null,
                publisher ?? null,
                total_pages ?? null,
                pages_read,
                spine_color ?? '#7741dd',
                spine_size ?? 'medio',
                id,
                userId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Livro não encontrado.',
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar livro:', error);

        return res.status(500).json({
            error: 'Não foi possível atualizar o livro.',
        });
    }
});

/**
 * @openapi
 * /api/books/{id}:
 *   delete:
 *     summary: Exclui um livro
 *     tags:
 *       - Livros
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do livro a excluir
 *     responses:
 *       200:
 *         description: Livro excluído com sucesso
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Livro não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
app.delete('/api/books/:id', authenticateToken, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: 'O ID deve ser um número inteiro positivo.',
        });
    }

    try {
        const result = await pool.query(
            'DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING *',
            [id,userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Livro não encontrado.',
            });
        }

        try {
            await removeStoredCover(result.rows[0].cover_path);
        } catch (cleanupError) {
            console.error('Não foi possível remover a capa do livro excluído:', cleanupError);
        }

        return res.status(200).json({
            message: 'Livro excluído com sucesso.',
            book: result.rows[0],
        });
    } catch (error) {
        console.error('Erro ao excluir livro:', error);

        return res.status(500).json({
            error: 'Não foi possível excluir o livro.',
        });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/reviews:
 *   get:
 *     summary: Busca a avaliação de um livro
 *     tags:
 *       - Avaliações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Avaliação encontrada ou lista vazia
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Livro não encontrado
 */
app.get('/api/books/:bookId/reviews', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'O ID do livro deve ser positivo.' });
    }

    try {
        const result = await pool.query(
            `SELECT r.*
             FROM reviews r
             INNER JOIN books b ON b.id = r.book_id
             WHERE r.book_id = $1 AND b.user_id = $2`,
            [bookId, userId],
        );

        return res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar avaliação:', error);
        return res.status(500).json({ error: 'Não foi possível consultar a avaliação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/reviews:
 *   post:
 *     summary: Cadastra uma avaliação para um livro
 *     tags:
 *       - Avaliações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 example: 4.5
 *               opinion:
 *                 type: string
 *                 example: Uma leitura envolvente.
 *     responses:
 *       201:
 *         description: Avaliação cadastrada
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Livro não encontrado
 *       409:
 *         description: Livro já possui avaliação
 */
app.post('/api/books/:bookId/reviews', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;
    const { rating, opinion } = req.body;
    const validRatings = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'O ID do livro deve ser positivo.' });
    }

    if (typeof rating !== 'number' || !validRatings.includes(rating)) {
        return res.status(400).json({ error: 'A nota deve estar entre 0.5 e 5, em intervalos de 0.5.' });
    }

    if (opinion !== undefined && opinion !== null && typeof opinion !== 'string') {
        return res.status(400).json({ error: 'A opinião deve ser um texto.' });
    }

    try {
        const book = await pool.query(
            'SELECT id FROM books WHERE id = $1 AND user_id = $2',
            [bookId, userId],
        );

        if (book.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado.' });
        }

        const result = await pool.query(
            `INSERT INTO reviews (book_id, rating, opinion)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [bookId, rating, opinion?.trim() || null],
        );

        return res.status(201).json(result.rows[0]);
    } catch (error: any) {
        if (error?.code === '23505') {
            return res.status(409).json({ error: 'Este livro já possui uma avaliação.' });
        }

        console.error('Erro ao cadastrar avaliação:', error);
        return res.status(500).json({ error: 'Não foi possível cadastrar a avaliação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/reviews:
 *   put:
 *     summary: Atualiza a avaliação de um livro
 *     tags:
 *       - Avaliações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 example: 5
 *               opinion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Avaliação atualizada
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Avaliação não encontrada
 */
app.put('/api/books/:bookId/reviews', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;
    const { rating, opinion } = req.body;
    const validRatings = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

    if (!Number.isInteger(bookId) || bookId <= 0 || typeof rating !== 'number' || !validRatings.includes(rating)) {
        return res.status(400).json({ error: 'Informe um ID válido e uma nota entre 0.5 e 5.' });
    }

    if (opinion !== undefined && opinion !== null && typeof opinion !== 'string') {
        return res.status(400).json({ error: 'A opinião deve ser um texto.' });
    }

    try {
        const result = await pool.query(
            `UPDATE reviews r
             SET rating = $1, opinion = $2
             FROM books b
             WHERE r.book_id = $3 AND r.book_id = b.id AND b.user_id = $4
             RETURNING r.*`,
            [rating, opinion?.trim() || null, bookId, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avaliação não encontrada.' });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar avaliação:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar a avaliação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/reviews:
 *   delete:
 *     summary: Exclui a avaliação de um livro
 *     tags:
 *       - Avaliações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Avaliação excluída
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Avaliação não encontrada
 */
app.delete('/api/books/:bookId/reviews', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'O ID do livro deve ser positivo.' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM reviews r
             USING books b
             WHERE r.book_id = $1 AND r.book_id = b.id AND b.user_id = $2
             RETURNING r.id`,
            [bookId, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avaliação não encontrada.' });
        }

        return res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir avaliação:', error);
        return res.status(500).json({ error: 'Não foi possível excluir a avaliação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/quotes:
 *   get:
 *     summary: Lista as citações de um livro
 *     tags:
 *       - Citações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Citações do livro
 *       400:
 *         description: ID inválido
 */
app.get('/api/books/:bookId/quotes', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'O ID do livro deve ser positivo.' });
    }

    try {
        const result = await pool.query(
            `SELECT q.*
             FROM quotes q
             INNER JOIN books b ON b.id = q.book_id
             WHERE q.book_id = $1 AND b.user_id = $2
             ORDER BY q.id`,
            [bookId, userId],
        );

        return res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar citações:', error);
        return res.status(500).json({ error: 'Não foi possível consultar as citações.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/quotes:
 *   post:
 *     summary: Cadastra uma citação
 *     tags:
 *       - Citações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quote_text
 *             properties:
 *               quote_text:
 *                 type: string
 *                 example: A leitura é uma viagem.
 *               page_number:
 *                 type: integer
 *                 example: 42
 *     responses:
 *       201:
 *         description: Citação cadastrada
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Livro não encontrado
 */
app.post('/api/books/:bookId/quotes', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const userId = req.userId;
    const { quote_text, page_number } = req.body;

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ error: 'O ID do livro deve ser positivo.' });
    }

    if (typeof quote_text !== 'string' || !quote_text.trim()) {
        return res.status(400).json({ error: 'O texto da citação é obrigatório.' });
    }

    if (page_number !== undefined && page_number !== null && (!Number.isInteger(page_number) || page_number <= 0)) {
        return res.status(400).json({ error: 'A página deve ser um número inteiro positivo.' });
    }

    try {
        const book = await pool.query(
            'SELECT id FROM books WHERE id = $1 AND user_id = $2',
            [bookId, userId],
        );

        if (book.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado.' });
        }

        const result = await pool.query(
            `INSERT INTO quotes (book_id, quote_text, page_number)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [bookId, quote_text.trim(), page_number ?? null],
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao cadastrar citação:', error);
        return res.status(500).json({ error: 'Não foi possível cadastrar a citação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/quotes/{id}:
 *   put:
 *     summary: Atualiza uma citação
 *     tags:
 *       - Citações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quote_text
 *             properties:
 *               quote_text:
 *                 type: string
 *               page_number:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Citação atualizada
 *       404:
 *         description: Citação não encontrada
 */
app.put('/api/books/:bookId/quotes/:id', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const quoteId = Number(req.params.id);
    const userId = req.userId;
    const { quote_text, page_number } = req.body;

    if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Os IDs devem ser números inteiros positivos.' });
    }

    if (typeof quote_text !== 'string' || !quote_text.trim()) {
        return res.status(400).json({ error: 'O texto da citação é obrigatório.' });
    }

    if (page_number !== undefined && page_number !== null && (!Number.isInteger(page_number) || page_number <= 0)) {
        return res.status(400).json({ error: 'A página deve ser um número inteiro positivo.' });
    }

    try {
        const result = await pool.query(
            `UPDATE quotes q
             SET quote_text = $1, page_number = $2
             FROM books b
             WHERE q.id = $3 AND q.book_id = $4
               AND q.book_id = b.id AND b.user_id = $5
             RETURNING q.*`,
            [quote_text.trim(), page_number ?? null, quoteId, bookId, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Citação não encontrada.' });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar citação:', error);
        return res.status(500).json({ error: 'Não foi possível atualizar a citação.' });
    }
});

/**
 * @openapi
 * /api/books/{bookId}/quotes/{id}:
 *   delete:
 *     summary: Exclui uma citação
 *     tags:
 *       - Citações
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Citação excluída
 *       404:
 *         description: Citação não encontrada
 */
app.delete('/api/books/:bookId/quotes/:id', authenticateToken, async (req: AuthRequest, res) => {
    const bookId = Number(req.params.bookId);
    const quoteId = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Os IDs devem ser números inteiros positivos.' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM quotes q
             USING books b
             WHERE q.id = $1 AND q.book_id = $2
               AND q.book_id = b.id AND b.user_id = $3
             RETURNING q.id`,
            [quoteId, bookId, userId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Citação não encontrada.' });
        }

        return res.status(204).send();
    } catch (error) {
        console.error('Erro ao excluir citação:', error);
        return res.status(500).json({ error: 'Não foi possível excluir a citação.' });
    }
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'A capa não pode exceder 5 MB.' });
        }

        return res.status(400).json({ error: 'Erro no upload da capa.' });
    }

    console.error('Erro não tratado:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
});


const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
    console.log(`API Estante Literária rodando na porta ${PORT}`);
});