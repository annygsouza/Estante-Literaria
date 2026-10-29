
# Estante Literária

API backend do projeto Estante Literária, desenvolvida com Node.js, TypeScript, Express e PostgreSQL.

## Tecnologias utilizadas

- Node.js
- TypeScript
- Express
- PostgreSQL
- JWT para autenticação
- Swagger para documentação da API
- Multer para upload de capas de livros

## Pré-requisitos

Antes de começar, instale:

- [Node.js](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/download/)

## 1. Clonar o repositório

```bash
git clone URL_DO_REPOSITORIO
cd Estante-Literaria
```

Substitua `URL_DO_REPOSITORIO` pela URL real do repositório Git.

## 2. Configurar o ambiente

Entre na pasta do backend:

```bash
cd backend
```

Crie seu arquivo `.env` a partir do exemplo.

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Edite o arquivo `.env` e preencha os dados da conexão com o PostgreSQL e a chave secreta do JWT.

Exemplo:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=estante_literaria
DB_USER=postgres
DB_PASSWORD=sua_senha
JWT_SECRET=sua_chave_secreta
PORT=3000
```

Utilize os dados do seu próprio PostgreSQL. Não compartilhe o arquivo `.env`.

## 3. Criar o banco de dados

No PostgreSQL, crie um banco chamado `estante_literaria`.

```sql
CREATE DATABASE estante_literaria;
```

Execute esse comando conectado a uma conta com permissão para criar bancos de dados.

## 4. Instalar as dependências

Dentro da pasta `backend`, execute:

```bash
npm install
```

## 5. Criar as tabelas

Execute as migrações SQL:

```bash
npm run migrate
```

## 6. Inserir dados iniciais

Para popular o banco com os dados de exemplo:

```bash
npm run seed
```

## 7. Executar a API

Inicie o servidor em modo de desenvolvimento:

```bash
npm run dev
```

A API estará disponível em:

```text
http://localhost:3000
```

## Estrutura do backend

```text
backend/
├── migrations/
│   ├── 001_create_initial_tables.sql
│   └── 002_add_book_covers.sql
├── seed.sql
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   ├── run-migrations.ts
│   │   └── run-seed.ts
│   └── server.ts
├── uploads/
├── .env.example
└── package.json
```

## Observações

- O arquivo `.env` contém configurações locais e não deve ser enviado ao repositório.
- As migrações criam e atualizam a estrutura do banco de dados.
- O seed insere dados de exemplo para facilitar os testes.
- As imagens de capas enviadas pela API podem ser armazenadas localmente.
