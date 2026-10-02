import express from "express";
import mongoose from "mongoose";
import Post from "../models/Post.js";
import Reply from "../models/Reply.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = express.Router();

function postForViewer(post, userId, replyCount) {
  const { votes = [], ...details } = post.toObject();
  const ownVote = votes.find((vote) => String(vote.user) === String(userId));

  return {
    ...details,
    score: votes.reduce((total, vote) => total + vote.value, 0),
    userVote: ownVote?.value || 0,
    ...(replyCount === undefined ? {} : { replyCount }),
  };
}

// GET all posts, sorted by newest, oldest, or net vote score
router.get("/", optionalAuth, async (req, res) => {
  const sort = req.query.sort || "new";
  if (!["new", "old", "top"].includes(sort)) {
    return res.status(400).json({ error: "Sort must be new, old, or top" });
  }

  try {
    const direction = sort === "old" ? 1 : -1;
    const posts = await Post.find().sort({ createdAt: direction, _id: direction });
    if (posts.length === 0) return res.json([]);

    const counts = await Reply.aggregate([
      { $match: { post: { $in: posts.map((post) => post._id) } } },
      { $group: { _id: "$post", count: { $sum: 1 } } },
    ]);
    const countsByPost = new Map(
      counts.map(({ _id, count }) => [String(_id), count])
    );

    const result = posts.map((post) =>
      postForViewer(post, req.user?.id, countsByPost.get(String(post._id)) || 0)
    );
    if (sort === "top") {
      result.sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.createdAt) - new Date(a.createdAt) ||
          String(b._id).localeCompare(String(a._id))
      );
    }
    res.json(result);
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
    res.status(201).json(postForViewer(post, req.user.id, 0));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET a post and its replies — public, no login required
router.get("/:id", optionalAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }

  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const replies = await Reply.find({ post: post._id }).sort({ createdAt: 1 });
    res.json({
      post: postForViewer(post, req.user?.id, replies.length),
      replies,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a reply — requires a logged-in user
router.post("/:id/replies", requireAuth, async (req, res) => {
  const body = req.body?.body;
  const parentReplyId = req.body?.parentReplyId;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Reply cannot be empty" });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }
  if (
    parentReplyId != null &&
    (typeof parentReplyId !== "string" || !mongoose.isValidObjectId(parentReplyId))
  ) {
    return res.status(400).json({ error: "Invalid parent reply ID" });
  }

  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (parentReplyId != null) {
      const parent = await Reply.findOne({ _id: parentReplyId, post: post._id });
      if (!parent) {
        return res.status(404).json({ error: "Parent reply not found in this post" });
      }
    }

    const reply = await Reply.create({
      post: post._id,
      parentReply: parentReplyId || null,
      body: body.trim(),
      bodyFormat: "markup",
      author: req.user.username,
    });
    res.status(201).json(reply);
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
