
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Estante Literária API',
            version: '1.0.0',
            description: 'API para gerenciar livros, avaliações e citações.',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Servidor local',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Informe o token JWT obtido no login.',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: [
        path.resolve(__dirname, '../server.ts'),
        path.resolve(__dirname, '../routes/auth.routes.ts'),
    ],
    failOnErrors: false,
};

export const swaggerSpec = swaggerJsdoc(options);
