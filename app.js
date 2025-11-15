const express = require("express");
const bodyParser = require("body-parser");
require('dotenv').config();

const { initializeDatabase, getStoredTodos, getTodoById, createTodo, updateTodo, deleteTodo } = require("./todos");

const app = express();

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Initialize database on startup
initializeDatabase();

app.get("/todos", async (req, res) => {
  const storedTodos = await getStoredTodos();
  res.json({ todos: storedTodos });
});

app.get("/todos/:id", async (req, res) => {
  const todo = await getTodoById(req.params.id);
  if (!todo) {
    return res.status(404).json({ message: "Todo not found!" });
  }
  res.json({ todo });
});

app.post("/todo", async (req, res) => {
  try {
    const newTodo = await createTodo(req.body);
    res.status(201).json({ message: "Stored new todo.", todo: newTodo });
  } catch (err) {
    res.status(500).json({ message: "Error creating todo", error: err.message });
  }
});

app.put("/todos/:id", async (req, res) => {
  try {
    const updatedTodo = await updateTodo(req.params.id, req.body);
    if (!updatedTodo) {
      return res.status(404).json({ message: "Todo not found!" });
    }
    res.json({ message: "Todo updated!", todo: updatedTodo });
  } catch (err) {
    res.status(500).json({ message: "Error updating todo", error: err.message });
  }
});

app.delete("/todos/:id", async (req, res) => {
  try {
    const deleted = await deleteTodo(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Todo not found!" });
    }
    res.json({ message: "Todo deleted!" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting todo", error: err.message });
  }
});

app.listen(8080, () => {
  console.log("Server running on http://localhost:8080");
});