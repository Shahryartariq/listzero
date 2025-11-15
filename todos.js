const fs = require('node:fs/promises');

async function getStoredTodos() {
  const rawFileContent = await fs.readFile('./data/todos.json', { encoding: 'utf-8' });
  const data = JSON.parse(rawFileContent);
  const storedTodos = data.todos ?? [];
  return storedTodos;
}

function storeTodos(todos) {
  return fs.writeFile('./data/todos.json', JSON.stringify({ todos: todos || [] }));
}

exports.getStoredTodos = getStoredTodos;
exports.storeTodos = storeTodos;