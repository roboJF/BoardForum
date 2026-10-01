import express from "express";
import mongoose from "mongoose";
import Post from "../models/Post.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = express.Router();

function postForViewer(post, userId) {
  const { votes = [], ...details } = post.toObject();
  const ownVote = votes.find((vote) => String(vote.user) === String(userId));

  return {
    ...details,
    score: votes.reduce((total, vote) => total + vote.value, 0),
    userVote: ownVote?.value || 0,
  };
}

// GET all posts, newest first — public, no login required
router.get("/", optionalAuth, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts.map((post) => postForViewer(post, req.user?.id)));
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
    res.status(201).json(postForViewer(post, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a vote — clicking the same vote again removes it
router.post("/:id/vote", requireAuth, async (req, res) => {
  const { value } = req.body || {};
  if (value !== 1 && value !== -1) {
    return res.status(400).json({ error: "Vote must be 1 or -1" });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const post = await Post.findById(req.params.id);
      if (!post) return res.status(404).json({ error: "Post not found" });

      const voteIndex = post.votes.findIndex(
        (vote) => String(vote.user) === String(req.user.id)
      );
      if (voteIndex === -1) {
        post.votes.push({ user: req.user.id, value });
      } else if (post.votes[voteIndex].value === value) {
        post.votes.splice(voteIndex, 1);
      } else {
        post.votes[voteIndex].value = value;
      }

      try {
        await post.save();
        return res.json(postForViewer(post, req.user.id));
      } catch (err) {
        if (err.name !== "VersionError") throw err;
      }
    }

    res.status(409).json({ error: "Vote changed at the same time; please try again" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
