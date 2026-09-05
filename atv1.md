# Atividade 1

## 1. Quais tabelas você definiu inicialmente?

Planejo utilizar quatro tabelas iniciais:
- **users**: armazenará os usuários da aplicação.
- **books**: armazenará as informações dos livros cadastrados, além das informações para o controle da leitura e da personalização da estante.
- **reviews**: armazenará as avaliações e opiniões dos usuários sobre os livros.
- **quotes**: armazenará as citações favoritas associadas aos livros.

## 2. Você utilizou migrations? Se sim, quantas migrations? Descreva em uma frase o que cada uma faz.

Pretendo começar com quatro migrations. A primeira criará a tabela users, a segunda criará a tabela books, a terceira criará a tabela reviews e a quarta criará a tabela quotes.

## 3. Qual o caminho do arquivo que gera a seed do seu banco?

Planejo utilizar o arquivo src/database/seed.ts para gerar a seed do banco de dados.

## 4. Quais os endpoints que você irá implementar inicialmente? Cada endpoint deve ser um método e um path. Explique em um parágrafo por que você resolveu priorizar a implementação desses endpoints.

Inicialmente, planejo implementar os endpoints `GET /api/books`, `GET /api/books/:id`, `POST /api/books`, `POST /api/books/:id/reviews` e `POST /api/books/:id/quotes`.

Esses endpoints foram escolhidos porque representam as funcionalidades principais da Estante Literária.
- `GET /api/books` permitirá consultar os livros cadastrados.
- `GET /api/books/:id` permitirá consultar as informações de um livro específico. 
- `POST /api/books` será utilizado para cadastrar novos livros, incluindo os livros cadastrados manualmente. 
- `POST /api/books/:id/reviews` permitirá registrar a avaliação e a opinião sobre um livro.
- `POST /api/books/:id/quotes` permitirá cadastrar as citações favoritas.

## 5. Você está usando algum framework para escrever os endpoints da sua API? Se sim, qual?

Planejo utilizar o Express com TypeScript para desenvolver a API. O Express será utilizado para definir e organizar os endpoints da aplicação.
