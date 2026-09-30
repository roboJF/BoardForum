import express from "express";
import Post from "../models/Post.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET all posts, newest first — public, no login required
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a new post — requires a logged-in user
router.post("/", requireAuth, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: "Title and body are required" });
    }
    // author is taken from the verified token, never trusted from the client
    const post = await Post.create({ title, body, author: req.user.username });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
