"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001";

export default function Home() {
  const [message, setMessage] = useState("");
  const [tripId, setTripId] = useState("");
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [options, setOptions] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [status, setStatus] = useState("idle");

  async function sendMessage(event) {
    event.preventDefault();
    if (!message.trim()) return;

    setStatus("loading");
    try {
      const response = await fetch(`${API_ORIGIN}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: tripId || undefined, message })
      });
      const data = await response.json();
      setTripId(data.tripId);
      setPlanMarkdown(data.planMarkdown || "");
      setOptions(data.options || null);
      setEvidence(data.evidence || []);
      setMessage("");
    } catch (error) {
      console.error(error);
    } finally {
      setStatus("idle");
    }
  }

  async function buyOption(optionId) {
    setStatus("buying");
    try {
      const response = await fetch(`${API_ORIGIN}/api/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, optionId })
      });
      await response.json();
    } catch (error) {
      console.error(error);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Failproof Travel</p>
          <h1>Adaptive travel plans with memory and purchase intent</h1>
          <p className="subhead">
            Collaborative chat, vector-backed evidence, and x402 demo flow.
          </p>
        </div>
        <div className="status">
          <span>Trip: {tripId || "new"}</span>
          <span>Status: {status}</span>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Chat</h2>
          <form onSubmit={sendMessage} className="composer">
            <textarea
              rows={5}
              placeholder="Plan 3 days in Tokyo under $1800"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button type="submit" disabled={status !== "idle"}>
              Send
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Plan</h2>
          <div className="plan">
            {planMarkdown ? (
              <ReactMarkdown>{planMarkdown}</ReactMarkdown>
            ) : (
              <p className="muted">Your plan will appear here.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Evidence</h2>
          <div className="evidence">
            {evidence.length === 0 ? (
              <p className="muted">No evidence yet. Run a search to collect sources.</p>
            ) : (
              evidence.map((item, index) => (
                <div key={index} className="evidence-item">
                  <p>{item.title || "Source"}</p>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Options</h2>
          <div className="options">
            {options?.flights?.map((option, index) => (
              <div key={`flight-${index}`} className="option-card">
                <p>{option.label}</p>
                <span>${option.price} {option.currency}</span>
                <button
                  type="button"
                  onClick={() => buyOption(`flight-${index}`)}
                  disabled={!tripId || status !== "idle"}
                >
                  Buy (x402)
                </button>
              </div>
            ))}
            {options?.lodging?.map((option, index) => (
              <div key={`lodging-${index}`} className="option-card">
                <p>{option.label}</p>
                <span>${option.pricePerNight} {option.currency} / night</span>
                <button
                  type="button"
                  onClick={() => buyOption(`lodging-${index}`)}
                  disabled={!tripId || status !== "idle"}
                >
                  Buy (x402)
                </button>
              </div>
            ))}
            {!options && <p className="muted">Options populate after a plan.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
