BEGIN;

-- usuarios de teste

INSERT INTO users (name, email)
VALUES
    ('Anny', 'anny@exemplo.com'),
    ('Davi', 'davi@exemplo.com');

-- livro para teste na estante de Anny

INSERT INTO books (
    user_id,
    title,
    author,
    total_pages,
    pages_read,
    spine_color,
    spine_size
)
VALUES (
    (SELECT id FROM users WHERE email = 'anny@exemplo.com'),
    'Babel ou a necessidade de violência',
    'Rebecca F. Kuang',
    591,
    473,
    '#8d0808',
    'medio'
);

-- mesmo título na estante de Davi, com escolhas diferentes

INSERT INTO books (
    user_id,
    title,
    author,
    total_pages,
    pages_read,
    spine_color,
    spine_size
)
VALUES (
    (SELECT id FROM users WHERE email = 'davi@exemplo.com'),
    'Babel ou a necessidade de violência',
    'Rebecca F. Kuang',
    591,
    300,
    '#0b1357',
    'grande'
);

-- avaliação de Anny para o livro da sua estante

INSERT INTO reviews (book_id, rating, opinion)
SELECT books.id, 5.0, 'Eu adorei o livro! A autora é genial.'
FROM books
JOIN users ON books.user_id = users.id
WHERE users.email = 'anny@exemplo.com'
  AND books.title = 'Babel ou a necessidade de violência';

-- frases para testar os cards de citações

INSERT INTO quotes (book_id, quote_text, page_number)
SELECT books.id,
       'Era isso que ele queria: um caminho suave e sem percalços para um futuro sem surpresas. O único obstáculo, claro, era sua consciência.',
        160
FROM books
JOIN users ON books.user_id = users.id
WHERE users.email = 'anny@exemplo.com'
  AND books.title = 'Babel ou a necessidade de violência';

INSERT INTO quotes (book_id, quote_text, page_number)
SELECT books.id,
       'Mas escravizados somos, e trabalhamos na plantação de outro homem; nós cuidamos da vinha, mas o vinho é do dono. John Dryden',
       218
FROM books
JOIN users ON books.user_id = users.id
WHERE users.email = 'anny@exemplo.com'
  AND books.title = 'Babel ou a necessidade de violência';
    
COMMIT;