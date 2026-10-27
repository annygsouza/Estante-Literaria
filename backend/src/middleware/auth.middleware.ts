import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    userId?: number;
}

export function authenticateToken(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): void {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
        res.status(401).json({
            message: 'Token de autenticação não informado.',
        });
        return;
    }

    const token = authorization.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        res.status(500).json({
            message: 'Chave de autenticação não configurada.',
        });
        return;
    }

    try {
        const decoded = jwt.verify(token, secret);

        if (
            typeof decoded === 'string' ||
            typeof decoded.userId !== 'number'
        ) {
            res.status(401).json({
                message: 'Token inválido.',
            });
            return;
        }

        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({
            message: 'Token inválido ou expirado.',
        });
    }
}