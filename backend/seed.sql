
BEGIN;

-- Usuários de teste: inserir somente se ainda não existirem
INSERT INTO users (name, email)
VALUES
    ('Anny', 'anny@exemplo.com'),
    ('Davi', 'davi@exemplo.com')
ON CONFLICT (email) DO NOTHING;

-- Livro de Anny: inserir somente se ainda não existir
INSERT INTO books (
    user_id,
    title,
    author,
    total_pages,
    pages_read,
    spine_color,
    spine_size
)
SELECT
    u.id,
    'Babel ou a necessidade de violência',
    'Rebecca F. Kuang',
    591,
    473,
    '#8d0808',
    'medio'
FROM users u
WHERE u.email = 'anny@exemplo.com'
AND NOT EXISTS (
    SELECT 1
    FROM books b
    WHERE b.user_id = u.id
      AND b.title = 'Babel ou a necessidade de violência'
);

-- Livro de Davi: inserir somente se ainda não existir
INSERT INTO books (
    user_id,
    title,
    author,
    total_pages,
    pages_read,
    spine_color,
    spine_size
)
SELECT
    u.id,
    'Babel ou a necessidade de violência',
    'Rebecca F. Kuang',
    591,
    300,
    '#0b1357',
    'grande'
FROM users u
WHERE u.email = 'davi@exemplo.com'
AND NOT EXISTS (
    SELECT 1
    FROM books b
    WHERE b.user_id = u.id
      AND b.title = 'Babel ou a necessidade de violência'
);

-- Avaliação de Anny: inserir somente se ainda não existir
INSERT INTO reviews (book_id, rating, opinion)
SELECT
    b.id,
    5.0,
    'Eu adorei o livro! A autora é genial.'
FROM books b
JOIN users u ON b.user_id = u.id
WHERE u.email = 'anny@exemplo.com'
  AND b.title = 'Babel ou a necessidade de violência'
  AND NOT EXISTS (
      SELECT 1 FROM reviews r WHERE r.book_id = b.id
  );

-- Primeira citação de Anny
INSERT INTO quotes (book_id, quote_text, page_number)
SELECT
    b.id,
    'Era isso que ele queria: um caminho suave e sem percalços para um futuro sem surpresas. O único obstáculo, claro, era sua consciência.',
    160
FROM books b
JOIN users u ON b.user_id = u.id
WHERE u.email = 'anny@exemplo.com'
  AND b.title = 'Babel ou a necessidade de violência'
  AND NOT EXISTS (
      SELECT 1
      FROM quotes q
      WHERE q.book_id = b.id
        AND q.page_number = 160
  );

-- Segunda citação de Anny
INSERT INTO quotes (book_id, quote_text, page_number)
SELECT
    b.id,
    'Mas escravizados somos, e trabalhamos na plantação de outro homem; nós cuidamos da vinha, mas o vinho é do dono. John Dryden',
    218
FROM books b
JOIN users u ON b.user_id = u.id
WHERE u.email = 'anny@exemplo.com'
  AND b.title = 'Babel ou a necessidade de violência'
  AND NOT EXISTS (
      SELECT 1
      FROM quotes q
      WHERE q.book_id = b.id
        AND q.page_number = 218
  );

COMMIT;
