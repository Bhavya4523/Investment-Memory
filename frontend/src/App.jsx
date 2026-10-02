import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  useEffect(() => {
    fetchInvestments();
  }, []);

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

        {investments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <h4>No investments saved yet</h4>
            <p>Your confirmed records will appear here.</p>
          </div>
        ) : (
          <div className="investment-list">
            {investments.map((investment) => (
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