import express from "express";

const app = express();
const PORT = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Hello! The server is up and running." });
});

app.listen(PORT, () => {
  console.log(`Server is listening at http://localhost:${PORT}`);
});
