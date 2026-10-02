import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8000";

const emptyDetails = {
  stock: "",
  quantity: "",
  buy_price: "",
  reason: "",
  intent: "",
  time_horizon: "",
  review_price: "",
  review_date: "",
};

function App() {

  const [note, setNote] = useState("");
  const [details, setDetails] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewHistory, setReviewHistory] = useState({});
  const [historyLoadingId, setHistoryLoadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDetails, setEditDetails] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(
  () => localStorage.getItem("investment-memory-theme") === "dark"
    );

    useEffect(() => {
      localStorage.setItem(
        "investment-memory-theme",
        darkMode ? "dark" : "light"
      );
    }, [darkMode]);

  async function fetchInvestments() {
    try {
      const response = await fetch(`${API_URL}/investments`);

      if (!response.ok) {
        throw new Error("Could not load saved investments.");
      }

      const data = await response.json();
      setInvestments(data);
    } catch (err) {
      setError(err.message);
    }
  }
async function handleSearch() {
  const query = searchQuery.trim();

  if (!query) {
    setSearchResults(null);
    return;
  }

  setSearching(true);
  setError("");

  try {
    const response = await fetch(
      `${API_URL}/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error("Could not search saved investments.");
    }

    const data = await response.json();
    setSearchResults(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setSearching(false);
  }
}

function handleClearSearch() {
  setSearchQuery("");
  setSearchResults(null);
}
  useEffect(() => {
    fetchInvestments();
  }, []);

  async function handleStartRecording() {
  setError("");
  setSuccess("");

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setError("Audio recording is not supported by this browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioChunksRef.current = [];

    const preferredType = "audio/webm;codecs=opus";
    const options = MediaRecorder.isTypeSupported(preferredType)
      ? { mimeType: preferredType }
      : {};

    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());

      const mimeType = recorder.mimeType || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      if (!audioBlob.size) {
        setError("No audio was recorded. Please try again.");
        setRecording(false);
        return;
      }

      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${extension}`);

      setTranscribing(true);
      setError("");

      try {
        const response = await fetch(`${API_URL}/transcribe`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Audio transcription failed.");
        }

        if (!data.text?.trim()) {
          throw new Error("No speech was detected. Please try recording again.");
        }

        setNote((current) =>
          current.trim()
            ? `${current.trim()}\n${data.text.trim()}`
            : data.text.trim()
        );

        setSuccess("Transcription ready. Review the text before extracting details.");
      } catch (err) {
        setError(err.message);
      } finally {
        setTranscribing(false);
        setRecording(false);
      }
    };

    recorder.start();
    setRecording(true);
  } catch (err) {
    setError(
      err.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow microphone access and try again."
        : `Could not start recording: ${err.message}`
    );
  }
}

function handleStopRecording() {
  const recorder = mediaRecorderRef.current;

  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }
}

  async function handleExtract() {
    if (!note.trim()) {
      setError("Please enter an investment note first.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setDetails(null);

    try {
      const response = await fetch(`${API_URL}/extract-investment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Extraction failed.");
      }

      setDetails({
        ...emptyDetails,
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key,
            value ?? "",
          ])
        ),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setDetails((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSave() {
    if (!details?.stock.trim()) {
      setError("Please enter a stock name before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const numericFields = [
      "quantity",
      "buy_price",
      "review_price",
    ];

    const payload = {
      ...details,
      original_note: note,
    };

    for (const field of numericFields) {
      payload[field] =
        payload[field] === "" ? null : Number(payload[field]);
    }

    for (const field of [
      "reason",
      "intent",
      "time_horizon",
      "review_date",
    ]) {
      payload[field] = payload[field] || null;
    }

    try {
      const response = await fetch(`${API_URL}/investments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not save investment.");
      }

      setSuccess(`${data.stock} saved successfully.`);
      setNote("");
      setDetails(null);
      await fetchInvestments();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  
  }
  function startReview(investmentId) {
  setReviewingId(investmentId);
  setReviewNote("");
  setNextReviewDate("");
  setError("");
  setSuccess("");
}

function cancelReview() {
  setReviewingId(null);
  setReviewNote("");
  setNextReviewDate("");
}

async function handleMarkReviewed(investmentId) {
  setReviewSaving(true);
  setError("");
  setSuccess("");

  try {
    const response = await fetch(
      `${API_URL}/investments/${investmentId}/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_note: reviewNote.trim() || null,
          next_review_date: nextReviewDate || null,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not record review.");
    }

    setSuccess("Review recorded successfully.");
    cancelReview();
    await fetchInvestments();
  } catch (err) {
    setError(err.message);
  } finally {
    setReviewSaving(false);
  }
}
async function toggleReviewHistory(investmentId) {
  // Hide history if it is already open.
  if (reviewHistory[investmentId]) {
    setReviewHistory((current) => {
      const updated = { ...current };
      delete updated[investmentId];
      return updated;
    });
    return;
  }

  setHistoryLoadingId(investmentId);
  setError("");

  try {
    const response = await fetch(
      `${API_URL}/investments/${investmentId}/reviews`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not load review history."
      );
    }

    setReviewHistory((current) => ({
      ...current,
      [investmentId]: data,
    }));
  } catch (err) {
    setError(err.message);
  } finally {
    setHistoryLoadingId(null);
  }
}
function startEditing(investment) {
  setEditingId(investment.id);
  setEditDetails({
    stock: investment.stock ?? "",
    quantity: investment.quantity ?? "",
    buy_price: investment.buy_price ?? "",
    reason: investment.reason ?? "",
    intent: investment.intent ?? "",
    time_horizon: investment.time_horizon ?? "",
    review_price: investment.review_price ?? "",
    review_date: investment.review_date
      ? investment.review_date.slice(0, 10)
      : "",
    original_note: investment.original_note ?? "",
  });

  setError("");
  setSuccess("");
}

function cancelEditing() {
  setEditingId(null);
  setEditDetails(null);
}

function handleEditFieldChange(event) {
  const { name, value } = event.target;

  setEditDetails((current) => ({
    ...current,
    [name]: value,
  }));
}

async function handleUpdateInvestment() {
  if (!editDetails?.stock.trim()) {
    setError("Please enter a stock name before saving.");
    return;
  }

  setEditSaving(true);
  setError("");
  setSuccess("");

  const numericFields = [
    "quantity",
    "buy_price",
    "review_price",
  ];

  const payload = {
    ...editDetails,
  };

  for (const field of numericFields) {
    payload[field] =
      payload[field] === "" ? null : Number(payload[field]);
  }

  for (const field of [
    "reason",
    "intent",
    "time_horizon",
    "review_date",
    "original_note",
  ]) {
    payload[field] = payload[field] || null;
  }

  try {
    const response = await fetch(
      `${API_URL}/investments/${editingId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not update investment."
      );
    }

    setSuccess(`${data.stock} updated successfully.`);
    cancelEditing();
    await fetchInvestments();
  } catch (err) {
    setError(err.message);
  } finally {
    setEditSaving(false);
  }
}

 const displayedInvestments = searchResults ?? investments;
 const today = new Date();
 const todayString = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

const reviewReminders = investments
  .filter((investment) => {
    const reviewDate = investment.review_date?.slice(0, 10);
    return reviewDate && reviewDate <= todayString;
  })
  .sort((a, b) =>
    a.review_date.localeCompare(b.review_date)
  );
  return (
    <main className={`app-shell ${darkMode ? "dark-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">IM</div>
          <div>
            <h1>Investment Memory</h1>
            <p>Your personal investment journal</p>
          </div>
        </div>
       
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setDarkMode((current) => !current)}
          aria-label="Toggle dark mode"
        >
          {darkMode ? "☀ Light" : "🌙 Dark"}
        </button>
      </header>

      <section className="intro">
        <p className="eyebrow">YOUR PERSONAL RECORD</p>
        <h2>Remember why you invested.</h2>
        <p>
          Record your own investment decisions, targets, and review plans.
          Gemma helps organize your notes—you stay in control.
        </p>
      </section>

      <section className="panel capture-panel">
        <div className="section-heading">
          <div>
            <h3>Capture an investment</h3>
            <p>Write naturally. You can review every extracted detail.</p>
          </div>
          <span className="step-label">01 / Capture</span>
        </div>

        <label htmlFor="investment-note">Your investment note</label>
                <textarea
          id="investment-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Example: I bought 20 shares of BEL at ₹390 because of recent news. I plan to hold it for the long term..."
          rows={5}
        />

        {/* Voice recording controls */}
        <div className="voice-controls">
          {!recording ? (
            <button
              type="button"
              className="secondary-button"
              onClick={handleStartRecording}
              disabled={transcribing || loading || saving}
            >
              🎙 Record voice
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button recording-button"
              onClick={handleStopRecording}
            >
              ■ Stop recording
            </button>
          )}

          {recording && <span className="helper-text">Recording…</span>}
          {transcribing && (
            <span className="helper-text">Transcribing locally…</span>
          )}
        </div>

        <div className="form-footer">
          <span className="helper-text">
            Your note is sent to your locally running Gemma model.
          </span>
          <button
            className="primary-button"
            onClick={handleExtract}
            disabled={loading || !note.trim()}
          >
            {loading ? "Extracting..." : "✦ Extract details"}
          </button>
        </div>
      </section>

      {error && <div className="message error-message">{error}</div>}
      {success && (
        <div className="message success-message">{success}</div>
      )}

      {details && (
        <section className="panel review-panel">
          <div className="section-heading">
            <div>
              <h3>Review extracted details</h3>
              <p>Check and correct these fields before saving.</p>
            </div>
            <span className="step-label">02 / Confirm</span>
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="stock">Stock name *</label>
              <input
                id="stock"
                name="stock"
                value={details.stock}
                onChange={handleFieldChange}
              />
            </div>

            <div className="field">
              <label htmlFor="quantity">Quantity</label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={details.quantity}
                onChange={handleFieldChange}
              />
            </div>

            <div className="field">
              <label htmlFor="buy_price">Purchase price (₹)</label>
              <input
                id="buy_price"
                name="buy_price"
                type="number"
                min="0"
                step="any"
                value={details.buy_price}
                onChange={handleFieldChange}
              />
            </div>

            <div className="field">
              <label htmlFor="reason">Why did you invest?</label>
              <input
                id="reason"
                name="reason"
                value={details.reason}
                onChange={handleFieldChange}
              />
            </div>

            <div className="field">
              <label htmlFor="intent">Your plan</label>
              <input
                id="intent"
                name="intent"
                value={details.intent}
                onChange={handleFieldChange}
                placeholder="e.g. hold, review"
              />
            </div>

            <div className="field">
              <label htmlFor="time_horizon">Time horizon</label>
              <input
                id="time_horizon"
                name="time_horizon"
                value={details.time_horizon}
                onChange={handleFieldChange}
                placeholder="e.g. long term"
              />
            </div>

            <div className="field">
              <label htmlFor="review_price">Review price (₹)</label>
              <input
                id="review_price"
                name="review_price"
                type="number"
                min="0"
                step="any"
                value={details.review_price}
                onChange={handleFieldChange}
              />
            </div>

            <div className="field">
              <label htmlFor="review_date">Review date</label>
              <input
                id="review_date"
                name="review_date"
                type="date"
                value={details.review_date}
                onChange={handleFieldChange}
              />
            </div>
          </div>

          <div className="review-footer">
            <p>
              Nothing is saved until you confirm. Missing information can
              remain blank.
            </p>
            <button
              className="primary-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Confirm & save"}
            </button>
          </div>
        </section>
      )}
      {reviewReminders.length > 0 && (
  <section className="panel reminders-panel">
    <div className="section-heading">
      <div>
        <h3>Review reminders</h3>
        <p>These are your own review dates that are due or overdue.</p>
      </div>
      <span className="count-badge">
        {reviewReminders.length} due
      </span>
    </div>

    <div className="reminder-list">
  {reviewReminders.map((investment) => (
    <article className="reminder-item" key={investment.id}>
      <div className="reminder-main">
        <div>
          <strong>{investment.stock}</strong>
          <p>
            Review date:{" "}
            {investment.review_date?.slice(0, 10)}
          </p>
        </div>

        <span className="record-tag">
          {investment.review_date?.slice(0, 10) === todayString
            ? "Due today"
            : "Overdue"}
        </span>
      </div>

      {reviewingId === investment.id ? (
        <div className="review-form">
          <label htmlFor={`review-note-${investment.id}`}>
            What did you notice?
          </label>

          <textarea
            id={`review-note-${investment.id}`}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Add your own review note..."
            rows={3}
          />

          <label htmlFor={`next-review-${investment.id}`}>
            Next review date
          </label>

          <input
            id={`next-review-${investment.id}`}
            type="date"
            value={nextReviewDate}
            onChange={(event) => setNextReviewDate(event.target.value)}
          />

          <div className="review-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => handleMarkReviewed(investment.id)}
              disabled={reviewSaving}
            >
              {reviewSaving ? "Saving review..." : "Save review"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={cancelReview}
              disabled={reviewSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary-button"
          onClick={() => startReview(investment.id)}
        >
          ✓ Mark reviewed
        </button>
      )}
    </article>
  ))}
</div>
  </section>
)}

      <section className="dashboard">
        <div className="section-heading">
          <div>
            <h3>My investment memory</h3>
            <p>Your saved notes and personal plans.</p>
          </div>
          <span className="count-badge">{investments.length} records</span>
        </div>
        <div className="search-controls">
  <input
    type="search"
    value={searchQuery}
    onChange={(event) => setSearchQuery(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") {
        handleSearch();
      }
    }}
    placeholder="Search stock, reason, or original note..."
    aria-label="Search investment memories"
  />

  <button
    type="button"
    className="secondary-button"
    onClick={handleSearch}
    disabled={searching}
  >
    {searching ? "Searching..." : "Search"}
  </button>

  {searchResults !== null && (
    <button
      type="button"
      className="secondary-button"
      onClick={handleClearSearch}
    >
      Clear
    </button>
  )}
</div>

        {displayedInvestments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
                    <h4>
          {searchResults !== null
            ? "No matching memories found"
            : "No investments saved yet"}
        </h4>
        <p>
          {searchResults !== null
            ? "Try another stock name or phrase from your note."
            : "Your confirmed records will appear here."}
        </p>
                  </div>
        ) : (
          <div className="investment-list">
            {displayedInvestments.map((investment) => (
              <article className="investment-card" key={investment.id}>
                <div className="investment-card-top">
                  <div>
                    <h4>{investment.stock}</h4>
                    <p>
                      {investment.quantity ?? "Quantity not recorded"}{" "}
                      {investment.quantity === 1 ? "share" : "shares"}
                    </p>
                  </div>
                  <span className="record-tag">Saved record</span>
                </div>

                <div className="investment-details">
                  <div>
                    <span>Purchase price</span>
                    <strong>
                      {investment.buy_price == null
                        ? "Not recorded"
                        : `₹${investment.buy_price}`}
                    </strong>
                  </div>
                  <div>
                    <span>Your plan</span>
                    <strong>{investment.intent || "Not recorded"}</strong>
                  </div>
                  <div>
                    <span>Review price</span>
                    <strong>
                      {investment.review_price == null
                        ? "Not set"
                        : `₹${investment.review_price}`}
                    </strong>
                  </div>
                </div>

                {investment.reason && (
                  <p className="reason">
                    <strong>Why:</strong> {investment.reason}
                  </p>
                )}

                <details className="original-note">
                  <summary>View original note</summary>
                  <p>{investment.original_note}</p>
                </details>
                <button
  type="button"
  className="history-button"
  onClick={() => toggleReviewHistory(investment.id)}
  disabled={historyLoadingId === investment.id}
>
  {historyLoadingId === investment.id
    ? "Loading history..."
    : reviewHistory[investment.id]
      ? "Hide review history"
      : "View review history"}
</button>

{reviewHistory[investment.id] && (
  <div className="review-history">
    {reviewHistory[investment.id].length === 0 ? (
      <p className="history-empty">No reviews recorded yet.</p>
    ) : (
      reviewHistory[investment.id].map((review) => (
        <div className="history-item" key={review.id}>
          <div className="history-item-header">
            <strong>
              Reviewed{" "}
              {review.reviewed_at
                ? new Date(review.reviewed_at).toLocaleDateString()
                : "date not recorded"}
            </strong>

            {review.next_review_date && (
              <span className="record-tag">
                Next: {review.next_review_date.slice(0, 10)}
              </span>
            )}
          </div>

          {review.review_note ? (
            <p>{review.review_note}</p>
          ) : (
            <p className="history-empty">No review note added.</p>
          )}
        </div>
      ))
    )}
  </div>
)}
{editingId === investment.id ? (
  <div className="edit-investment-form">
    <div className="section-heading">
      <div>
        <h4>Edit investment</h4>
        <p>Correct your saved record without creating a new one.</p>
      </div>
    </div>

    <div className="field-grid">
      <div className="field">
        <label htmlFor={`edit-stock-${investment.id}`}>
          Stock name
        </label>
        <input
          id={`edit-stock-${investment.id}`}
          name="stock"
          value={editDetails?.stock ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-quantity-${investment.id}`}>
          Quantity
        </label>
        <input
          id={`edit-quantity-${investment.id}`}
          name="quantity"
          type="number"
          min="1"
          value={editDetails?.quantity ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-buy-price-${investment.id}`}>
          Purchase price (₹)
        </label>
        <input
          id={`edit-buy-price-${investment.id}`}
          name="buy_price"
          type="number"
          min="0"
          step="any"
          value={editDetails?.buy_price ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-reason-${investment.id}`}>
          Why did you invest?
        </label>
        <input
          id={`edit-reason-${investment.id}`}
          name="reason"
          value={editDetails?.reason ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-intent-${investment.id}`}>
          Your plan
        </label>
        <input
          id={`edit-intent-${investment.id}`}
          name="intent"
          value={editDetails?.intent ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-horizon-${investment.id}`}>
          Time horizon
        </label>
        <input
          id={`edit-horizon-${investment.id}`}
          name="time_horizon"
          value={editDetails?.time_horizon ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-review-price-${investment.id}`}>
          Review price (₹)
        </label>
        <input
          id={`edit-review-price-${investment.id}`}
          name="review_price"
          type="number"
          min="0"
          step="any"
          value={editDetails?.review_price ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-review-date-${investment.id}`}>
          Review date
        </label>
        <input
          id={`edit-review-date-${investment.id}`}
          name="review_date"
          type="date"
          value={editDetails?.review_date ?? ""}
          onChange={handleEditFieldChange}
        />
      </div>

      <div className="field field-full">
        <label htmlFor={`edit-original-note-${investment.id}`}>
          Original note
        </label>
        <textarea
          id={`edit-original-note-${investment.id}`}
          name="original_note"
          value={editDetails?.original_note ?? ""}
          onChange={handleEditFieldChange}
          rows={4}
        />
      </div>
    </div>

    <div className="review-actions">
      <button
        type="button"
        className="primary-button"
        onClick={handleUpdateInvestment}
        disabled={editSaving}
      >
        {editSaving ? "Saving changes..." : "Save changes"}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={cancelEditing}
        disabled={editSaving}
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  <button
    type="button"
    className="history-button"
    onClick={() => startEditing(investment)}
  >
    ✎ Edit saved record
  </button>
)}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="app-footer">
        Personal record-keeping only. This app does not provide investment
        recommendations.
      </footer>
    </main>
  );
}

export default App;