import { useEffect, useRef, useState } from "react";

const API_BASE = "/api";

function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      className={`spoiler ${revealed ? "revealed" : ""}`}
      aria-label={revealed ? undefined : "Reveal spoiler"}
      aria-expanded={revealed}
      onClick={() => setRevealed(!revealed)}
    >
      {revealed ? children : "Spoiler — click to reveal"}
    </button>
  );
}

function findClosingMarker(text, start, marker) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "\\" && index + 1 < text.length) {
      index += 1;
      continue;
    }
    if (marker === "*" && text.startsWith("**", index)) {
      index += 1;
      continue;
    }
    if (text.startsWith(marker, index)) return index;
  }
  return -1;
}

function renderFormattedText(text, depth = 0, insideSpoiler = false) {
  if (depth >= 10) return text;

  const markers = insideSpoiler ? ["**", "*"] : ["**", "||", "*"];
  const result = [];
  let plainText = "";

  for (let index = 0; index < text.length; ) {
    if (
      text[index] === "\\" &&
      index + 1 < text.length &&
      ["*", "|", "\\"].includes(text[index + 1])
    ) {
      plainText += text[index + 1];
      index += 2;
      continue;
    }

    const marker = markers.find((candidate) => text.startsWith(candidate, index));
    const end = marker
      ? findClosingMarker(text, index + marker.length, marker)
      : -1;

    if (marker && end > index + marker.length) {
      if (plainText) {
        result.push(plainText);
        plainText = "";
      }

      const content = renderFormattedText(
        text.slice(index + marker.length, end),
        depth + 1,
        insideSpoiler || marker === "||"
      );

      if (marker === "**") {
        result.push(<strong key={index}>{content}</strong>);
      } else if (marker === "*") {
        result.push(<em key={index}>{content}</em>);
      } else {
        result.push(<Spoiler key={index}>{content}</Spoiler>);
      }

      index = end + marker.length;
    } else {
      plainText += text[index];
      index += 1;
    }
  }

  if (plainText) result.push(plainText);
  return result;
}

function FormattingToolbar({ label, onFormat }) {
  return (
    <div className="format-toolbar" role="toolbar" aria-label={label}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat("**")} aria-label="Bold selected text" title="Bold">
        <strong>B</strong>
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat("*")} aria-label="Italicize selected text" title="Italic">
        <em>I</em>
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat("||")} aria-label="Mark selected text as a spoiler" title="Spoiler">
        Spoiler
      </button>
      <span className="format-hint">Use <code>{"\\*"}</code> for a literal *</span>
    </div>
  );
}

function arrangeReplies(replies) {
  const byId = new Map(replies.map((reply) => [String(reply._id), reply]));
  const children = new Map();
  const ordered = [];
  const seen = new Set();

  for (const reply of replies) {
    const parentId = reply.parentReply && String(reply.parentReply);
    if (!parentId) continue;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(reply);
  }

  const visit = (root) => {
    const stack = [{ reply: root, depth: 0 }];
    while (stack.length) {
      const { reply, depth } = stack.pop();
      const id = String(reply._id);
      if (seen.has(id)) continue;
      seen.add(id);
      const parent = byId.get(String(reply.parentReply));
      ordered.push({ reply, depth, parentAuthor: parent?.author });
      const descendants = children.get(id) || [];
      for (let index = descendants.length - 1; index >= 0; index -= 1) {
        stack.push({ reply: descendants[index], depth: depth + 1 });
      }
    }
  };

  for (const reply of replies) {
    if (!reply.parentReply || !byId.has(String(reply.parentReply))) {
      visit(reply);
    }
  }
  for (const reply of replies) visit(reply);

  return ordered;
}

function postIdFromHash() {
  return window.location.hash.match(/^#\/posts\/([a-f0-9]{24})$/i)?.[1].toLowerCase() || null;
}

function PostCard({ post, token, voting, voteError, onVote, detail = false }) {
  const postUrl = `#/posts/${post._id}`;
  const replyLabel = `${post.replyCount ?? 0} ${(post.replyCount ?? 0) === 1 ? "reply" : "replies"}`;

  const openPost = (event) => {
    if (detail || event.target.closest("a, button") || window.getSelection()?.toString()) {
      return;
    }
    window.location.hash = postUrl;
  };

  return (
    <article className={`post ${detail ? "" : "post-clickable"}`} onClick={openPost}>
      <h2>{detail ? post.title : <a href={postUrl}>{post.title}</a>}</h2>
      <p>{renderFormattedText(post.body)}</p>
      <div className="post-footer">
        <div className="vote-controls" role="group" aria-label={`Votes for ${post.title}`}>
          <button
            type="button"
            className={post.userVote === 1 ? "active" : ""}
            aria-label={`Upvote ${post.title}`}
            aria-pressed={post.userVote === 1}
            title={token ? "Upvote" : "Log in to vote"}
            disabled={!token || voting}
            onClick={() => onVote(post._id, 1)}
          >
            ▲
          </button>
          <span className="vote-score" aria-label={`Score: ${post.score ?? 0}`}>
            {post.score ?? 0}
          </span>
          <button
            type="button"
            className={post.userVote === -1 ? "active" : ""}
            aria-label={`Downvote ${post.title}`}
            aria-pressed={post.userVote === -1}
            title={token ? "Downvote" : "Log in to vote"}
            disabled={!token || voting}
            onClick={() => onVote(post._id, -1)}
          >
            ▼
          </button>
        </div>
        {detail ? (
          <span className="reply-count">{replyLabel}</span>
        ) : (
          <a className="reply-count" href={postUrl}>{replyLabel}</a>
        )}
        <span className="meta">
          posted by {post.author} &middot;{" "}
          {new Date(post.createdAt).toLocaleString()}
        </span>
      </div>
      {voteError && <p className="vote-error" role="alert">{voteError}</p>}
    </article>
  );
}

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingPosts, setVotingPosts] = useState({});
  const [voteErrors, setVoteErrors] = useState({});
  const [selectedPostId, setSelectedPostId] = useState(postIdFromHash);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const replyInput = useRef(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const bodyInput = useRef(null);

  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_BASE}/posts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [token]);

  useEffect(() => {
    const updateSelectedPost = () => {
      setSelectedPostId(postIdFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", updateSelectedPost);
    return () => window.removeEventListener("hashchange", updateSelectedPost);
  }, []);

  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPost(null);
      setReplies([]);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setReplyError("");
    setReplyBody("");
    setReplyTarget(null);

    const fetchDetail = async () => {
      try {
        const res = await fetch(`${API_BASE}/posts/${selectedPostId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load post");
        setSelectedPost(data.post);
        setReplies(data.replies);
      } catch (err) {
        if (!controller.signal.aborted) {
          setSelectedPost(null);
          setDetailError(err.message || "Could not load post");
        }
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    };

    fetchDetail();
    return () => controller.abort();
  }, [selectedPostId, token]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Please fill out both fields");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
        return;
      }

      setToken(data.token);
      setUsername(data.username);
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      setAuthUsername("");
      setAuthPassword("");
    } catch (err) {
      setAuthError("Could not reach the server");
    }
  };

  const handleLogout = () => {
    setToken("");
    setUsername("");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
  };

  const handleVote = async (postId, value) => {
    if (!token || votingPosts[postId]) return;

    setVotingPosts((current) => ({ ...current, [postId]: true }));
    setVoteErrors((current) => ({ ...current, [postId]: "" }));

    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error(data.error || "Could not save your vote");
      }

      setPosts((current) =>
        current.map((post) => (post._id === postId ? { ...post, ...data } : post))
      );
      setSelectedPost((current) =>
        current?._id === postId ? { ...current, ...data } : current
      );
    } catch (err) {
      setVoteErrors((current) => ({
        ...current,
        [postId]: err.message || "Could not save your vote",
      }));
    } finally {
      setVotingPosts((current) => ({ ...current, [postId]: false }));
    }
  };

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!token || !selectedPostId || !replyBody.trim() || replySubmitting) return;

    const postId = selectedPostId;
    const parentReplyId = replyTarget;
    setReplySubmitting(true);
    setReplyError("");

    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: replyBody, parentReplyId }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error(data.error || "Could not post reply");
      }

      if (postIdFromHash() === postId) {
        setReplies((current) => [...current, data]);
        setReplyBody("");
        setReplyTarget(null);
      }
      setSelectedPost((current) =>
        current?._id === postId
          ? { ...current, replyCount: (current.replyCount || 0) + 1 }
          : current
      );
      setPosts((current) =>
        current.map((post) =>
          post._id === postId
            ? { ...post, replyCount: (post.replyCount || 0) + 1 }
            : post
        )
      );
    } catch (err) {
      if (postIdFromHash() === postId) {
        setReplyError(err.message || "Could not post reply");
      }
    } finally {
      setReplySubmitting(false);
    }
  };

  const formatSelection = (input, value, setValue, marker) => {
    const textarea = input.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const selectedText = value.slice(selectionStart, selectionEnd);
    const replacement = `${marker}${selectedText}${marker}`;
    setValue(
      value.slice(0, selectionStart) + replacement + value.slice(selectionEnd)
    );

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart + marker.length,
        selectionStart + marker.length + selectedText.length
      );
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // token missing/expired — send them back to login
          handleLogout();
        }
        console.error(data.error);
        return;
      }

      setPosts([data, ...posts]);
      setTitle("");
      setBody("");
    } catch (err) {
      console.error("Failed to create post:", err);
    }
  };

  const authBox = (
    <div className="auth-box">
      <div className="auth-tabs">
        <button
          type="button"
          className={authMode === "login" ? "active" : ""}
          onClick={() => {
            setAuthMode("login");
            setAuthError("");
          }}
        >
          Log in
        </button>
        <button
          type="button"
          className={authMode === "register" ? "active" : ""}
          onClick={() => {
            setAuthMode("register");
            setAuthError("");
          }}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleAuthSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Username"
          value={authUsername}
          onChange={(e) => setAuthUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={authPassword}
          onChange={(e) => setAuthPassword(e.target.value)}
        />
        {authError && <p className="auth-error">{authError}</p>}
        <button type="submit">
          {authMode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="auth-hint">
        You need an account to post, reply, or vote, but anyone can read.
      </p>
    </div>
  );

  const replyComposer = (targetReply = null) => (
    <form className="reply-form" onSubmit={handleReplySubmit}>
      {targetReply && (
        <p className="replying-to">Replying to {targetReply.author}</p>
      )}
      <div className="post-editor">
        <textarea
          ref={replyInput}
          aria-label={targetReply ? `Reply to ${targetReply.author}` : "Write a reply"}
          placeholder="Write a reply..."
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          required
        />
        <FormattingToolbar
          label="Format reply text"
          onFormat={(marker) => formatSelection(replyInput, replyBody, setReplyBody, marker)}
        />
      </div>
      {replyError && <p className="reply-error" role="alert">{replyError}</p>}
      <div className="reply-form-actions">
        {targetReply && (
          <button
            className="reply-cancel"
            type="button"
            disabled={replySubmitting}
            onClick={() => {
              setReplyTarget(null);
              setReplyBody("");
              setReplyError("");
            }}
          >
            Cancel
          </button>
        )}
        <button className="reply-submit" type="submit" disabled={replySubmitting || !replyBody.trim()}>
          {replySubmitting ? "Posting..." : "Reply"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="container">
      <div className="header-row">
        <h1><a href="#/">board.</a></h1>
        {token && (
          <div className="account-info">
            <span>
              signed in as <strong>{username}</strong>
            </span>
            <button className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>

      {token && !selectedPostId && (
        <form onSubmit={handleSubmit} className="post-form">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="post-editor">
            <textarea
              ref={bodyInput}
              placeholder="What's on your mind?"
              aria-label="Post body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <FormattingToolbar
              label="Format post text"
              onFormat={(marker) => formatSelection(bodyInput, body, setBody, marker)}
            />
          </div>
          <button className="post-submit" type="submit">Post</button>
        </form>
      )}
      {!token && !selectedPostId && authBox}

      {selectedPostId ? (
        <div className="detail-view">
          <a className="back-link" href="#/">← Back to posts</a>
          {detailLoading && selectedPost?._id !== selectedPostId && <p>Loading post...</p>}
          {detailError && <p className="detail-error" role="alert">{detailError}</p>}
          {selectedPost?._id === selectedPostId && (
            <>
              <PostCard
                post={selectedPost}
                token={token}
                voting={votingPosts[selectedPostId]}
                voteError={voteErrors[selectedPostId]}
                onVote={handleVote}
                detail
              />
              <section className="replies-section" aria-label="Replies">
                <h3>Replies ({selectedPost.replyCount ?? replies.length})</h3>
                {token ? (
                  !replyTarget && replyComposer()
                ) : (
                  <p className="reply-note">Log in below to write a reply.</p>
                )}
                {replies.length === 0 ? (
                  <p className="reply-note">No replies yet.</p>
                ) : (
                  <div className="reply-list">
                    {arrangeReplies(replies).map(({ reply, depth, parentAuthor }) => (
                      <div
                        className={`reply-thread-item ${depth ? "nested" : ""}`}
                        key={reply._id}
                        style={{ marginLeft: `${Math.min(depth, 5) * 16}px` }}
                      >
                        <article className="reply">
                          <p>{reply.bodyFormat === "markup" ? renderFormattedText(reply.body) : reply.body}</p>
                          <div className="reply-footer">
                            <span className="meta">
                              replied by {reply.author}
                              {parentAuthor && <> to {parentAuthor}</>}
                              {" "}&middot; {new Date(reply.createdAt).toLocaleString()}
                            </span>
                            {token && (
                              <button
                                className="reply-action"
                                type="button"
                                aria-label={`Reply to ${reply.author}`}
                                aria-expanded={replyTarget === reply._id}
                                disabled={replySubmitting}
                                onClick={() => {
                                  if (replyTarget !== reply._id) {
                                    setReplyTarget(reply._id);
                                    setReplyBody("");
                                    setReplyError("");
                                  }
                                  requestAnimationFrame(() => replyInput.current?.focus());
                                }}
                              >
                                Reply
                              </button>
                            )}
                          </div>
                        </article>
                        {replyTarget === reply._id && replyComposer(reply)}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {!token && authBox}
            </>
          )}
        </div>
      ) : (
        <div className="post-list">
          {loading && <p>Loading posts...</p>}
          {!loading && posts.length === 0 && <p>No posts yet. Be the first!</p>}
          {posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              token={token}
              voting={votingPosts[post._id]}
              voteError={voteErrors[post._id]}
              onVote={handleVote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
