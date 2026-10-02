import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import Post from "../models/Post.js";
import Reply from "../models/Reply.js";
import router from "./posts.js";

const postId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const token = jwt.sign(
  { id: userId, username: "alice" },
  process.env.JWT_SECRET || "dev-secret-change-me"
);

function callRoute(path, method, { authorized = false, body = {}, id = postId, query = {} } = {}) {
  const route = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} exists`);

  const req = {
    body,
    headers: authorized ? { authorization: `Bearer ${token}` } : {},
    params: { id },
    query,
  };

  return new Promise((resolve, reject) => {
    let index = 0;
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, data });
        return this;
      },
    };
    const next = (error) => {
      if (error) return reject(error);
      const handler = route.stack[index++]?.handle;
      if (!handler) return reject(new Error("Route did not respond"));
      try {
        Promise.resolve(handler(req, res, next)).catch(reject);
      } catch (err) {
        reject(err);
      }
    };
    next();
  });
}

test("votes require login and toggle, switch, and stay private", async () => {
  const originalFindById = Post.findById;
  const originalFind = Post.find;
  const originalAggregate = Reply.aggregate;
  let stored = new Post({ _id: postId, title: "Hello", body: "World" }).toObject();

  Post.findById = async (id) => {
    if (id !== postId) return null;
    const post = new Post(stored);
    post.save = async () => {
      await post.validate();
      stored = post.toObject();
      return post;
    };
    return post;
  };
  Post.find = () => ({ sort: async () => [new Post(stored)] });
  Reply.aggregate = async () => [];

  try {
    assert.equal((await callRoute("/:id/vote", "post", { body: { value: 1 } })).status, 401);
    assert.equal((await callRoute("/:id/vote", "post", { authorized: true, body: { value: 0 } })).status, 400);
    assert.equal((await callRoute("/:id/vote", "post", { authorized: true, body: { value: 1 }, id: "bad" })).status, 400);

    let result = await callRoute("/:id/vote", "post", { authorized: true, body: { value: 1 } });
    assert.equal(result.data.score, 1);
    assert.equal(result.data.userVote, 1);
    assert.equal("votes" in result.data, false);

    result = await callRoute("/:id/vote", "post", { authorized: true, body: { value: 1 } });
    assert.equal(result.data.score, 0);
    assert.equal(result.data.userVote, 0);

    result = await callRoute("/:id/vote", "post", { authorized: true, body: { value: -1 } });
    assert.equal(result.data.score, -1);
    assert.equal(result.data.userVote, -1);

    result = await callRoute("/:id/vote", "post", { authorized: true, body: { value: 1 } });
    assert.equal(result.data.score, 1);
    assert.equal(result.data.userVote, 1);

    result = await callRoute("/", "get");
    assert.equal(result.data[0].score, 1);
    assert.equal(result.data[0].userVote, 0);
    assert.equal("votes" in result.data[0], false);

    result = await callRoute("/", "get", { authorized: true });
    assert.equal(result.data[0].userVote, 1);
  } finally {
    Post.findById = originalFindById;
    Post.find = originalFind;
    Reply.aggregate = originalAggregate;
  }
});

test("feed sorts by new, old, and top score with new as the default", async () => {
  const originalFind = Post.find;
  const originalAggregate = Reply.aggregate;
  const oldId = "507f1f77bcf86cd799439021";
  const middleId = "507f1f77bcf86cd799439022";
  const newId = "507f1f77bcf86cd799439023";
  const voters = ["507f191e810c19729de860ea", "507f191e810c19729de860eb"];
  const posts = [
    new Post({
      _id: oldId,
      title: "Old",
      body: "Old post",
      createdAt: new Date("2025-01-01"),
      votes: voters.map((user) => ({ user, value: 1 })),
    }),
    new Post({
      _id: middleId,
      title: "Middle",
      body: "Middle post",
      createdAt: new Date("2025-02-01"),
      votes: voters.map((user) => ({ user, value: 1 })),
    }),
    new Post({
      _id: newId,
      title: "New",
      body: "New post",
      createdAt: new Date("2025-03-01"),
      votes: [{ user: voters[0], value: -1 }],
    }),
  ];

  Post.find = () => ({
    sort: async ({ createdAt }) => [...posts].sort((a, b) =>
      createdAt * (a.createdAt - b.createdAt || String(a._id).localeCompare(String(b._id)))
    ),
  });
  Reply.aggregate = async () => [];

  try {
    const ids = (result) => result.data.map((post) => String(post._id));
    assert.deepEqual(ids(await callRoute("/", "get")), [newId, middleId, oldId]);
    assert.deepEqual(ids(await callRoute("/", "get", { query: { sort: "new" } })), [newId, middleId, oldId]);
    assert.deepEqual(ids(await callRoute("/", "get", { query: { sort: "old" } })), [oldId, middleId, newId]);
    assert.deepEqual(ids(await callRoute("/", "get", { query: { sort: "top" } })), [middleId, oldId, newId]);
    assert.equal((await callRoute("/", "get", { query: { sort: "other" } })).status, 400);
  } finally {
    Post.find = originalFind;
    Reply.aggregate = originalAggregate;
  }
});

test("boards isolate feeds, preserve legacy posts in General, and validate new posts", async () => {
  const originalFind = Post.find;
  const originalCreate = Post.create;
  const originalAggregate = Reply.aggregate;
  const legacyId = "507f1f77bcf86cd799439031";
  const techId = "507f1f77bcf86cd799439032";
  const legacy = new Post({ _id: legacyId, title: "Before boards", body: "Hello" }).toObject();
  delete legacy.board;
  const technology = new Post({ _id: techId, title: "New device", body: "Hello", board: "technology" }).toObject();
  const stored = [legacy, technology];
  let lastFilter;

  Post.find = (filter) => {
    lastFilter = filter;
    return {
      sort: async () => stored
        .filter((post) => filter.$or
          ? post.board === "general" || post.board === undefined
          : post.board === filter.board)
        .map((post) => new Post(post)),
    };
  };
  Post.create = async (fields) => {
    const post = new Post(fields);
    await post.validate();
    return post;
  };
  Reply.aggregate = async () => [];

  try {
    let result = await callRoute("/", "get");
    assert.deepEqual(result.data.map((post) => String(post._id)), [legacyId]);
    assert.equal(result.data[0].board, "general");
    assert.deepEqual(lastFilter, { $or: [{ board: "general" }, { board: { $exists: false } }] });

    result = await callRoute("/", "get", { query: { board: "technology" } });
    assert.deepEqual(result.data.map((post) => String(post._id)), [techId]);
    assert.deepEqual(lastFilter, { board: "technology" });

    result = await callRoute("/", "get", { query: { board: "entertainment" } });
    assert.deepEqual(result.data, []);
    assert.equal((await callRoute("/", "get", { query: { board: "unknown" } })).status, 400);

    result = await callRoute("/", "post", {
      authorized: true,
      body: { title: "Film", body: "Thoughts", board: "entertainment" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.board, "entertainment");
    assert.equal(result.data.author, "alice");

    result = await callRoute("/", "post", {
      authorized: true,
      body: { title: "Fallback", body: "Thoughts" },
    });
    assert.equal(result.data.board, "general");
    assert.equal((await callRoute("/", "post", {
      authorized: true,
      body: { title: "Invalid", body: "Thoughts", board: "unknown" },
    })).status, 400);
  } finally {
    Post.find = originalFind;
    Post.create = originalCreate;
    Reply.aggregate = originalAggregate;
  }
});

test("replies require login and appear only in post detail with a feed count", async () => {
  const originalFindById = Post.findById;
  const originalFind = Post.find;
  const originalReplyFind = Reply.find;
  const originalReplyFindOne = Reply.findOne;
  const originalReplyCreate = Reply.create;
  const originalAggregate = Reply.aggregate;
  const post = new Post({ _id: postId, title: "Hello", body: "World" });
  const storedReplies = [
    new Reply({
      _id: "507f1f77bcf86cd799439099",
      post: "507f1f77bcf86cd799439012",
      body: "Other post reply",
      author: "bob",
    }).toObject(),
  ];

  Post.findById = async (id) => (id === postId ? post : null);
  Post.find = () => ({ sort: async () => [post] });
  Reply.find = ({ post: replyPost }) => ({
    sort: async () => storedReplies
      .filter((reply) => String(reply.post) === String(replyPost))
      .map((reply) => new Reply(reply)),
  });
  Reply.findOne = async ({ _id, post: replyPost }) =>
    storedReplies.find(
      (reply) => String(reply._id) === String(_id) && String(reply.post) === String(replyPost)
    ) || null;
  Reply.create = async (fields) => {
    const reply = new Reply(fields);
    await reply.validate();
    reply.createdAt = new Date();
    storedReplies.push(reply.toObject());
    return reply;
  };
  Reply.aggregate = async () => {
    const count = storedReplies.filter((reply) => String(reply.post) === postId).length;
    return count ? [{ _id: post._id, count }] : [];
  };

  try {
    assert.equal((await callRoute("/:id/replies", "post", { body: { body: "Hi" } })).status, 401);
    assert.equal((await callRoute("/:id/replies", "post", { authorized: true, body: { body: "  " } })).status, 400);
    assert.equal((await callRoute("/:id", "get", { id: "bad" })).status, 400);
    assert.equal((await callRoute("/:id", "get", { id: "507f1f77bcf86cd799439012" })).status, 404);

    let result = await callRoute("/", "get");
    assert.equal(result.data[0].replyCount, 0);
    assert.equal("replies" in result.data[0], false);

    result = await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "  First reply  ", author: "impostor" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.body, "First reply");
    assert.equal(result.data.bodyFormat, "markup");
    assert.equal(result.data.author, "alice");
    assert.equal(result.data.parentReply, null);
    const firstReplyId = String(result.data._id);

    assert.equal((await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "Nested", parentReplyId: "bad" },
    })).status, 400);
    assert.equal((await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "Nested", parentReplyId: "507f1f77bcf86cd799439098" },
    })).status, 404);
    assert.equal((await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "Nested", parentReplyId: "507f1f77bcf86cd799439099" },
    })).status, 404);

    result = await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "**Nested**", parentReplyId: firstReplyId },
    });
    assert.equal(result.status, 201);
    assert.equal(String(result.data.parentReply), firstReplyId);
    assert.equal(result.data.bodyFormat, "markup");
    const secondReplyId = String(result.data._id);

    result = await callRoute("/:id/replies", "post", {
      authorized: true,
      body: { body: "Deeper", parentReplyId: secondReplyId },
    });
    assert.equal(result.status, 201);
    assert.equal(String(result.data.parentReply), secondReplyId);

    result = await callRoute("/", "get");
    assert.equal(result.data[0].replyCount, 3);
    assert.equal("replies" in result.data[0], false);

    result = await callRoute("/:id", "get");
    assert.equal(result.data.post.replyCount, 3);
    assert.equal(result.data.replies.length, 3);
    assert.equal(result.data.replies[0].body, "First reply");
    assert.equal(String(result.data.replies[1].parentReply), firstReplyId);
    assert.equal(String(result.data.replies[2].parentReply), secondReplyId);
  } finally {
    Post.findById = originalFindById;
    Post.find = originalFind;
    Reply.find = originalReplyFind;
    Reply.findOne = originalReplyFindOne;
    Reply.create = originalReplyCreate;
    Reply.aggregate = originalAggregate;
  }
});
