CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR (200) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(300) NOT NULL,
    author VARCHAR(300),
    publisher VARCHAR(200),
    total_pages INTEGER CHECK (total_pages > 0),
    pages_read INTEGER NOT NULL DEFAULT 0 CHECK (pages_read >= 0),
    spine_color VARCHAR(7) NOT NULL DEFAULT '#7741dd',
    spine_size VARCHAR(10) NOT NULL DEFAULT 'medio'
        CHECK (spine_size IN ('pequeno', 'medio', 'grande')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CHECK (total_pages IS NULL OR pages_read <= total_pages)
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL UNIQUE REFERENCES books(id),
    rating NUMERIC NOT NULL CHECK (rating IN (0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0)),
    opinion TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE quotes (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id),
    quote_text TEXT NOT NULL CHECK (length(trim(quote_text)) > 0),
    page_number INTEGER CHECK (page_number > 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);