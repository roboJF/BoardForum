import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import Post from "../models/Post.js";
import router from "./posts.js";

const postId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";
const token = jwt.sign(
  { id: userId, username: "alice" },
  process.env.JWT_SECRET || "dev-secret-change-me"
);

function callRoute(path, method, { authorized = false, body = {}, id = postId } = {}) {
  const route = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} exists`);

  const req = {
    body,
    headers: authorized ? { authorization: `Bearer ${token}` } : {},
    params: { id },
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
  }
});
