const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

// Initialize database table
async function initializeDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log('Todos table initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

async function getStoredTodos() {
  try {
    const result = await pool.query('SELECT * FROM todos ORDER BY created_at DESC');
    return result.rows;
  } catch (err) {
    console.error('Error fetching todos:', err);
    return [];
  }
}

async function getTodoById(id) {
  try {
    const result = await pool.query('SELECT * FROM todos WHERE id = $1', [parseInt(id)]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Error fetching todo:', err);
    return null;
  }
}

async function storeTodos(todos) {
  try {
    // This function is kept for compatibility but not used with PostgreSQL
    // Individual operations (create, update, delete) should be used instead
    console.warn('storeTodos is deprecated. Use individual CRUD operations instead.');
  } catch (err) {
    console.error('Error storing todos:', err);
  }
}

async function createTodo(todoData) {
  const { title, body } = todoData;
  
  try {
    const result = await pool.query(
      'INSERT INTO todos (title, body) VALUES ($1, $2) RETURNING *',
      [title, body]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error creating todo:', err);
    throw err;
  }
}

async function updateTodo(id, updatedData) {
  try {
    const existingTodo = await getTodoById(id);
    if (!existingTodo) {
      return null;
    }

    const updatedTodo = { ...existingTodo, ...updatedData };
    const { title, body, completed } = updatedTodo;

    const result = await pool.query(
      'UPDATE todos SET title = $1, body = $2 WHERE id = $3 RETURNING *',
      [title, body, parseInt(id)]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error updating todo:', err);
    throw err;
  }
}

async function deleteTodo(id) {
  try {
    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1 RETURNING *',
      [parseInt(id)]
    );
    return result.rowCount > 0;
  } catch (err) {
    console.error('Error deleting todo:', err);
    throw err;
  }
}

exports.initializeDatabase = initializeDatabase;
exports.getStoredTodos = getStoredTodos;
exports.getTodoById = getTodoById;
exports.storeTodos = storeTodos;
exports.createTodo = createTodo;
exports.updateTodo = updateTodo;
exports.deleteTodo = deleteTodo;