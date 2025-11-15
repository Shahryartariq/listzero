const express = require("express");
const bodyParser = require("body-parser");

const { getStoredTodos, storeTodos } = require("./todos");

const app = express();

app.use(bodyParser.json());

app.use((req, res, next) => {
  // Attach CORS headers
  // Required when using a detached backend (that runs on a different domain)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/todos", async (req, res) => {
  const storedTodos = await getStoredTodos();
  // await new Promise((resolve, reject) => setTimeout(() => resolve(), 1500));
  res.json({ todos: storedTodos });
});

app.get("/todos/:id", async (req, res) => {
  const storedTodos = await getStoredTodos();
  const todo = storedTodos.find((todo) => todo.id === req.params.id);
  res.json({ todo });
});

app.post("/todo", async (req, res) => {
  const existingTodos = await getStoredTodos();
  const postData = req.body;
  const newTodo = {
    ...postData,
    id: Math.random().toString(),
  };
  const updatedTodos = [newTodo, ...existingTodos];
  await storeTodos(updatedTodos);
  res.status(201).json({ message: "Stored new todo.", todo: newTodo });
});


app.put("/todos/:id", async (req, res) => {
  const todoId = req.params.id;
  const updatedData = req.body;
  const storedTodos = await getStoredTodos();

  const todoIndex = storedTodos.findIndex((todo) => todo.id === todoId);

  if (todoIndex < 0) {
    return res.status(404).json({ message: "Todo not found!" });
  }

  const updatedTodo = { ...storedTodos[todoIndex], ...updatedData };

  storedTodos[todoIndex] = updatedTodo;
  await storeTodos(storedTodos);

  res.json({ message: "Todo updated!", todo: updatedTodo });
});


app.delete("/todos/:id", async (req, res) => {
  const todoId = req.params.id;
  const storedTodos = await getStoredTodos();
  const updatedTodos = storedTodos.filter((todo) => todo.id !== todoId);

  if (updatedTodos.length === storedTodos.length) {
    return res.status(404).json({ message: "Todo not found!" });
  }

  await storeTodos(updatedTodos);
  res.json({ message: "Todo deleted!" });
});

app.listen(8080, () => {
  console.log("Server running on http://localhost:8080");
});