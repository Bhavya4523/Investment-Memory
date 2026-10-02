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
 const displayedInvestments = searchResults ?? investments;
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">IM</div>
          <div>
            <h1>Investment Memory</h1>
            <p>Your personal investment journal</p>
          </div>
        </div>
        <span className="local-badge">● Local AI</span>
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